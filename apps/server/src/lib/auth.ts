import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';
import { db } from './db.js';
import { forbidden, unauthorized } from './errors.js';

const secret = new TextEncoder().encode(config.JWT_SECRET);
export const ACCESS_TTL_SEC = 15 * 60;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const REFRESH_RACE_GRACE_MS = 30_000;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; sid: string; role: 'USER' | 'ADMIN' };
    }
  }
}

// OWASP-recommended argon2id parameters (19 MiB, t=2, p=1).
const argonOpts = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (pw: string) => argon2.hash(pw, argonOpts);
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);
// Used when the account does not exist, so login timing does not reveal registered emails.
const dummyHash = hashPassword('not-a-real-password-' + randomBytes(8).toString('hex'));
export const burnPasswordCheck = async (pw: string) => {
  await verifyPassword(await dummyHash, pw);
  return false;
};

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newOpaqueToken = () => randomBytes(32).toString('base64url');
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const safeEqualHex = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export async function signAccess(userId: string, sid: string) {
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .setAudience('vybe-api')
    .sign(secret);
}

/** Verifies the JWT and that its session is still live and the account usable. */
export async function authenticate(token: string) {
  let sub: string, sid: string, exp: number;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: 'vybe-api', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !payload.exp) throw new Error();
    sub = payload.sub;
    sid = payload.sid;
    exp = payload.exp;
  } catch {
    throw unauthorized('INVALID_TOKEN');
  }
  const session = await db.session.findUnique({
    where: { id: sid },
    select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { role: true, suspendedAt: true } } },
  });
  if (!session || session.userId !== sub || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized('SESSION_REVOKED');
  }
  if (session.user.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED');
  return { id: sub, sid, role: session.user.role, exp };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw unauthorized();
  const { exp: _exp, ...user } = await authenticate(h.slice(7));
  req.user = user;
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'ADMIN') throw forbidden();
  next();
};

/** Current user id; only call after requireAuth. */
export const uid = (req: { user?: { id: string } }) => {
  if (!req.user) throw unauthorized();
  return req.user.id;
};

/** Creates a session and its first refresh token. */
export async function issueSession(userId: string, deviceName?: string) {
  const refreshToken = newOpaqueToken();
  const session = await db.session.create({
    data: {
      userId,
      deviceName: deviceName?.slice(0, 80),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      refresh: { create: { tokenHash: sha256(refreshToken) } },
    },
  });
  return { accessToken: await signAccess(userId, session.id), refreshToken, expiresIn: ACCESS_TTL_SEC };
}

/** Rotates a refresh token. Re-use of an already-used token revokes the whole session. */
export async function rotateRefresh(refreshToken: string) {
  const hash = sha256(refreshToken);
  const next = newOpaqueToken();
  const result = await db.$transaction(async (tx) => {
    const row = await tx.refreshToken.findUnique({ where: { tokenHash: hash }, include: { session: { include: { user: true } } } });
    if (!row) return { error: 'INVALID_REFRESH' as const };
    const s = row.session;
    if (row.usedAt) {
      // Two runtimes on one phone (app + headless location task) can refresh at the same moment.
      // A replay within the grace window is refused but not treated as theft.
      if (Date.now() - row.usedAt.getTime() < REFRESH_RACE_GRACE_MS) return { error: 'REFRESH_RACE' as const };
      await tx.session.update({ where: { id: s.id }, data: { revokedAt: s.revokedAt ?? new Date() } });
      return { error: 'REFRESH_REUSED' as const, userId: s.userId };
    }
    if (s.revokedAt || s.expiresAt < new Date() || s.user.suspendedAt) return { error: 'SESSION_REVOKED' as const };
    // Conditional update guards concurrent refreshes with the same token: only one wins.
    const claimed = await tx.refreshToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return { error: 'INVALID_REFRESH' as const };
    await tx.refreshToken.create({ data: { sessionId: s.id, tokenHash: sha256(next) } });
    await tx.session.update({
      where: { id: s.id },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { userId: s.userId, sid: s.id };
  });
  if ('error' in result) return result;
  return { accessToken: await signAccess(result.userId, result.sid), refreshToken: next, expiresIn: ACCESS_TTL_SEC };
}

export const revokeAllSessions = (userId: string) =>
  db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), pushToken: null } });
