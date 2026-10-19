import { beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { api, makeUser, resetDb } from './helpers.js';
import { outbox } from '../src/lib/mail.js';
import { db } from '../src/lib/db.js';

const codeFor = (email: string) => {
  const m = [...outbox].reverse().find((x) => x.to === email);
  return m?.subject.match(/(\d{6})/)?.[1];
};

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});

describe('registration and verification', () => {
  it('registers, verifies by code and gets a session', async () => {
    const email = 'new@test.local';
    await api().post('/v1/auth/register').send({ email, password: 'a long password' }).expect(202);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const code = codeFor(email)!;
    const r = await api().post('/v1/auth/verify-email').send({ email, code }).expect(200);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.refreshToken).toBeTruthy();
    await api().get('/v1/me').set({ Authorization: `Bearer ${r.body.accessToken}` }).expect(200);
  });

  it('does not reveal whether an email is registered', async () => {
    const u = await makeUser('taken');
    const a = await api().post('/v1/auth/register').send({ email: `${u.username}@test.local`, password: 'whatever12345' });
    const b = await api().post('/v1/auth/register').send({ email: 'free@test.local', password: 'whatever12345' });
    expect(a.status).toBe(b.status);
    expect(a.body).toEqual(b.body);
    const f1 = await api().post('/v1/auth/forgot-password').send({ email: 'nobody@test.local' });
    const f2 = await api().post('/v1/auth/forgot-password').send({ email: `${u.username}@test.local` });
    expect(f1.status).toBe(f2.status);
  });

  it('rejects weak passwords and wrong codes, and locks the code after 5 attempts', async () => {
    await api().post('/v1/auth/register').send({ email: 'x@test.local', password: 'short' }).expect(400);
    const email = 'y@test.local';
    await api().post('/v1/auth/register').send({ email, password: 'a long password' }).expect(202);
    const good = codeFor(email)!;
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await api().post('/v1/auth/verify-email').send({ email, code: bad }).expect(400);
    // Even the right code is now refused.
    await api().post('/v1/auth/verify-email').send({ email, code: good }).expect(400);
  });

  it('refuses login until the email is verified', async () => {
    await api().post('/v1/auth/register').send({ email: 'z@test.local', password: 'a long password' });
    const r = await api().post('/v1/auth/login').send({ email: 'z@test.local', password: 'a long password' }).expect(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('login and sessions', () => {
  it('logs in with the right password only, same error for unknown email', async () => {
    const u = await makeUser('alice');
    await api().post('/v1/auth/login').send({ email: 'alice@test.local', password: 'correct horse battery' }).expect(200);
    const wrong = await api().post('/v1/auth/login').send({ email: 'alice@test.local', password: 'nope nope nope' }).expect(401);
    const unknown = await api().post('/v1/auth/login').send({ email: 'ghost@test.local', password: 'nope nope nope' }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(u).toBeTruthy();
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const u = await makeUser();
    const r1 = await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(u.refreshToken);
    // An immediate replay looks like two app runtimes racing: refused, session kept.
    const race = await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    expect(race.body.error.code).toBe('REFRESH_RACE');
    await api().get('/v1/me').set({ Authorization: `Bearer ${r1.body.accessToken}` }).expect(200);
    // A replay after the grace window = theft signal.
    await db.refreshToken.updateMany({ where: { usedAt: { not: null } }, data: { usedAt: new Date(Date.now() - 60_000) } });
    const replay = await api().post('/v1/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');
    // The legitimately rotated token is now dead too, and so is the access token.
    await api().post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await api().get('/v1/me').set({ Authorization: `Bearer ${r1.body.accessToken}` }).expect(401);
  });

  it('logout revokes the access token immediately', async () => {
    const u = await makeUser();
    await api().post('/v1/auth/logout').set(u.auth).expect(200);
    const r = await api().get('/v1/me').set(u.auth).expect(401);
    expect(r.body.error.code).toBe('SESSION_REVOKED');
  });

  it('rejects expired, forged and missing tokens', async () => {
    const u = await makeUser();
    const s = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    const expired = await new SignJWT({ sid: s.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(u.id)
      .setAudience('vybe-api')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    await api().get('/v1/me').set({ Authorization: `Bearer ${expired}` }).expect(401);
    const forged = await new SignJWT({ sid: s.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(u.id)
      .setAudience('vybe-api')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('some-other-secret-some-other-secret-123'));
    await api().get('/v1/me').set({ Authorization: `Bearer ${forged}` }).expect(401);
    await api().get('/v1/me').expect(401);
  });

  it('password reset changes the password and signs out all sessions', async () => {
    const u = await makeUser('bob');
    await api().post('/v1/auth/forgot-password').send({ email: 'bob@test.local' }).expect(202);
    const code = codeFor('bob@test.local')!;
    await api().post('/v1/auth/reset-password').send({ email: 'bob@test.local', code, newPassword: 'brand new password' }).expect(200);
    await api().get('/v1/me').set(u.auth).expect(401);
    await api().post('/v1/auth/login').send({ email: 'bob@test.local', password: 'brand new password' }).expect(200);
    await api().post('/v1/auth/login').send({ email: 'bob@test.local', password: 'correct horse battery' }).expect(401);
  });

  it('lists and revokes other sessions', async () => {
    const u = await makeUser('carol');
    const other = await api().post('/v1/auth/login').send({ email: 'carol@test.local', password: 'correct horse battery' }).expect(200);
    const list = await api().get('/v1/auth/sessions').set(u.auth).expect(200);
    expect(list.body.sessions).toHaveLength(2);
    const target = list.body.sessions.find((s: { current: boolean }) => !s.current);
    await api().delete(`/v1/auth/sessions/${target.id}`).set(u.auth).expect(200);
    await api().get('/v1/me').set({ Authorization: `Bearer ${other.body.accessToken}` }).expect(401);
  });
});

describe('profile', () => {
  it('enforces unique, well-formed usernames', async () => {
    const a = await makeUser('dana');
    const b = await makeUser('erin');
    await api().patch('/v1/me').set(b.auth).send({ username: 'DANA' }).expect(409);
    await api().patch('/v1/me').set(b.auth).send({ username: 'a b' }).expect(400);
    await api().patch('/v1/me').set(b.auth).send({ username: 'erin.x', displayName: 'Erin', bio: 'hi' }).expect(200);
    await api().patch('/v1/me').set(b.auth).send({ role: 'ADMIN' }).expect(400);
    expect(a).toBeTruthy();
  });
});
