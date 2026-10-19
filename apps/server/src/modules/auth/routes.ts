import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config.js';
import { db } from '../../lib/db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound, parse, unauthorized } from '../../lib/errors.js';
import { sendMail } from '../../lib/mail.js';
import { rl } from '../../lib/rateLimit.js';
import { disconnect } from '../../realtime.js';
import { push } from '../../lib/push.js';
import {
  burnPasswordCheck,
  hashPassword,
  issueSession,
  newCode,
  requireAuth,
  revokeAllSessions,
  rotateRefresh,
  safeEqualHex,
  sha256,
  uid,
  verifyPassword,
} from '../../lib/auth.js';

export const email = z.email().max(254).transform((s) => s.trim().toLowerCase());
export const password = z.string().min(10, 'at least 10 characters').max(128);
const deviceName = z.string().max(80).optional();
const CODE_TTL_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

const google = new OAuth2Client();

async function sendCode(userId: string, to: string, purpose: 'VERIFY' | 'RESET') {
  const code = newCode();
  await db.$transaction([
    // Only the newest code is valid.
    db.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    db.emailToken.create({ data: { userId, purpose, codeHash: sha256(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } }),
  ]);
  const what = purpose === 'VERIFY' ? 'verify your email' : 'reset your password';
  await sendMail(to, `Your Vybe code: ${code}`, `Use ${code} to ${what}. It expires in 15 minutes.\n\nIf this wasn't you, you can ignore this email.`);
}

/** Checks a code, counting attempts; marks it used on success. */
async function consumeCode(userId: string, purpose: 'VERIFY' | 'RESET', code: string) {
  const t = await db.emailToken.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!t || t.attempts >= MAX_CODE_ATTEMPTS) return false;
  if (!safeEqualHex(t.codeHash, sha256(code))) {
    await db.emailToken.update({ where: { id: t.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  const claimed = await db.emailToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count === 1;
}

export const authRouter = Router();

// Same response whether or not the email exists, so this cannot be used to enumerate accounts.
authRouter.post('/register', rl.authIp, rl.authEmail, async (req, res) => {
  const body = parse(z.object({ email, password }), req.body);
  const existing = await db.user.findUnique({ where: { email: body.email } });
  if (existing) {
    if (!existing.emailVerifiedAt) await sendCode(existing.id, existing.email, 'VERIFY');
    else
      await sendMail(body.email, 'Vybe sign-up attempt', 'Someone tried to create a Vybe account with this email. If it was you, sign in or reset your password instead.');
  } else {
    const user = await db.user.create({
      data: { email: body.email, passwordHash: await hashPassword(body.password), notificationPrefs: { create: {} }, locationSettings: { create: {} } },
    });
    audit('auth.register', user.id, req);
    await sendCode(user.id, user.email, 'VERIFY');
  }
  res.status(202).json({ ok: true });
});

authRouter.post('/verify-email', rl.authIp, rl.codeEmail, async (req, res) => {
  const body = parse(z.object({ email, code: z.string().regex(/^\d{6}$/), deviceName }), req.body);
  const user = await db.user.findUnique({ where: { email: body.email } });
  if (!user || !(await consumeCode(user.id, 'VERIFY', body.code))) throw badRequest('INVALID_CODE');
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
  audit('auth.email_verified', user.id, req);
  res.json(await issueSession(user.id, body.deviceName));
});

authRouter.post('/resend-verification', rl.authIp, rl.codeEmail, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const user = await db.user.findUnique({ where: { email: body.email } });
  if (user && !user.emailVerifiedAt) await sendCode(user.id, user.email, 'VERIFY');
  res.status(202).json({ ok: true });
});

authRouter.post('/login', rl.authIp, rl.authEmail, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().max(128), deviceName }), req.body);
  const user = await db.user.findUnique({ where: { email: body.email } });
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, body.password) : await burnPasswordCheck(body.password);
  if (!user || !ok) {
    audit('auth.login_failed', user?.id ?? null, req);
    throw unauthorized('INVALID_CREDENTIALS');
  }
  if (user.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED');
  // Revealing "unverified" is safe here: the caller already proved the password.
  if (!user.emailVerifiedAt) {
    await sendCode(user.id, user.email, 'VERIFY');
    throw forbidden('EMAIL_NOT_VERIFIED');
  }
  audit('auth.login', user.id, req);
  res.json(await issueSession(user.id, body.deviceName));
});

authRouter.post('/google', rl.authIp, async (req, res) => {
  const body = parse(z.object({ idToken: z.string().min(10).max(4096), deviceName }), req.body);
  if (!config.GOOGLE_CLIENT_IDS.length) throw notFound('GOOGLE_SIGNIN_DISABLED');
  let p;
  try {
    // verifyIdToken checks signature (Google JWKS), issuer, audience and expiry.
    p = (await google.verifyIdToken({ idToken: body.idToken, audience: config.GOOGLE_CLIENT_IDS })).getPayload();
  } catch {
    throw unauthorized('INVALID_GOOGLE_TOKEN');
  }
  if (!p?.sub || !p.email || !p.email_verified) throw unauthorized('INVALID_GOOGLE_TOKEN');
  const mail = p.email.toLowerCase();
  let user = await db.user.findUnique({ where: { googleSub: p.sub } });
  if (!user) {
    const byEmail = await db.user.findUnique({ where: { email: mail } });
    user = byEmail
      ? // Google has verified this email, so linking proves ownership of the same address.
        await db.user.update({ where: { id: byEmail.id }, data: { googleSub: p.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() } })
      : await db.user.create({
          data: { email: mail, googleSub: p.sub, emailVerifiedAt: new Date(), notificationPrefs: { create: {} }, locationSettings: { create: {} } },
        });
  }
  if (user.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED');
  audit('auth.login_google', user.id, req);
  res.json(await issueSession(user.id, body.deviceName));
});

authRouter.post('/refresh', rl.authIp, async (req, res) => {
  const body = parse(z.object({ refreshToken: z.string().min(20).max(200) }), req.body);
  const r = await rotateRefresh(body.refreshToken);
  if ('error' in r) {
    if (r.error === 'REFRESH_REUSED') {
      audit('auth.refresh_reuse_detected', r.userId ?? null, req);
      if (r.userId) void push(r.userId, 'security', { type: 'session_revoked' });
    }
    throw unauthorized(r.error);
  }
  res.json(r);
});

authRouter.post('/forgot-password', rl.authIp, rl.codeEmail, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const user = await db.user.findUnique({ where: { email: body.email } });
  // Google-only accounts may use this to add a password; the code proves email ownership.
  if (user) await sendCode(user.id, user.email, 'RESET');
  res.status(202).json({ ok: true });
});

authRouter.post('/reset-password', rl.authIp, rl.codeEmail, async (req, res) => {
  const body = parse(z.object({ email, code: z.string().regex(/^\d{6}$/), newPassword: password }), req.body);
  const user = await db.user.findUnique({ where: { email: body.email } });
  if (!user || !(await consumeCode(user.id, 'RESET', body.code))) throw badRequest('INVALID_CODE');
  await db.user.update({
    where: { id: user.id },
    // A reset code proves email ownership, so the email counts as verified too.
    data: { passwordHash: await hashPassword(body.newPassword), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  await revokeAllSessions(user.id);
  disconnect(user.id);
  audit('auth.password_reset', user.id, req);
  void push(user.id, 'security', { type: 'password_reset' });
  await sendMail(user.email, 'Your Vybe password was changed', 'Your password was reset and all devices were signed out. If this was not you, reset it again and contact support.');
  res.json({ ok: true });
});

authRouter.use(requireAuth);

authRouter.post('/logout', async (req, res) => {
  await db.session.update({ where: { id: req.user!.sid }, data: { revokedAt: new Date(), pushToken: null } });
  disconnect(uid(req), req.user!.sid);
  res.json({ ok: true });
});

authRouter.post('/change-password', async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().max(128), newPassword: password }), req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: uid(req) } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, body.currentPassword))) throw unauthorized('INVALID_CREDENTIALS');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  // Keep this session, end every other one.
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: req.user!.sid } }, data: { revokedAt: new Date(), pushToken: null } });
  audit('auth.password_changed', user.id, req);
  void push(user.id, 'security', { type: 'password_changed' });
  res.json({ ok: true });
});

authRouter.get('/sessions', async (req, res) => {
  const sessions = await db.session.findMany({
    where: { userId: uid(req), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
    orderBy: { lastUsedAt: 'desc' },
  });
  res.json({ sessions: sessions.map((s) => ({ ...s, current: s.id === req.user!.sid })) });
});

authRouter.delete('/sessions/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const r = await db.session.updateMany({ where: { id, userId: uid(req), revokedAt: null }, data: { revokedAt: new Date(), pushToken: null } });
  if (!r.count) throw notFound();
  disconnect(uid(req), id);
  audit('auth.session_revoked', uid(req), req);
  res.json({ ok: true });
});
