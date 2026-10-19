import { existsSync } from 'node:fs';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pino from 'pino';
import sharp from 'sharp';
import WebSocket from 'ws';
import { api, befriend, makeUser, resetDb, startServer, type TestUser } from './helpers.js';
import { db } from '../src/lib/db.js';
import { mediaPath } from '../src/lib/media.js';
import { limits } from '../src/lib/rateLimit.js';
import { redactPaths } from '../src/lib/logger.js';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => (srv = await startServer()));
afterAll(() => srv.close());
beforeEach(resetDb);

const connect = (u?: TestUser) =>
  new Promise<{ ws: WebSocket; events: { type: string; data: Record<string, unknown> }[] }>((resolve, reject) => {
    const ws = new WebSocket(srv.url.replace('http', 'ws') + '/ws', { headers: u ? { Authorization: `Bearer ${u.token}` } : {} });
    const events: { type: string; data: Record<string, unknown> }[] = [];
    ws.on('message', (m) => events.push(JSON.parse(m.toString())));
    ws.on('open', () => resolve({ ws, events }));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
const until = async (fn: () => boolean, ms = 3000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('websocket', () => {
  it('rejects unauthenticated and revoked connections', async () => {
    await expect(connect()).rejects.toThrow('401');
    const u = await makeUser();
    await api().post('/v1/auth/logout').set(u.auth).expect(200);
    await expect(connect(u)).rejects.toThrow('401');
  });

  it('delivers location updates only to authorized viewers', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const stranger = await makeUser();
    await befriend(owner, friend);
    const f = await connect(friend);
    const s = await connect(stranger);
    await api().put('/v1/locations/settings').set(owner.auth).send({ mode: 'ALL' }).expect(200);
    await api().post('/v1/locations').set(owner.auth).send({ lat: 1, lng: 2, capturedAt: new Date().toISOString() }).expect(200);
    await until(() => f.events.some((e) => e.type === 'location:update'));
    await new Promise((r) => setTimeout(r, 200));
    expect(s.events.filter((e) => e.type.startsWith('location'))).toEqual([]);
    // Ghost Mode tells viewers to drop the pin.
    await api().put('/v1/locations/settings').set(owner.auth).send({ ghost: true }).expect(200);
    await until(() => f.events.some((e) => e.type === 'location:removed'));
    f.ws.close();
    s.ws.close();
  });

  it('typing events to non-friends are refused', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const ca = await connect(a);
    const cb = await connect(b);
    ca.ws.send(JSON.stringify({ type: 'typing', data: { to: b.id, on: true } }));
    await until(() => ca.events.some((e) => e.type === 'error'));
    expect(cb.events.some((e) => e.type === 'typing')).toBe(false);
    ca.ws.close();
    cb.ws.close();
  });

  it('logout closes the live socket', async () => {
    const u = await makeUser();
    const c = await connect(u);
    const closed = new Promise<number>((r) => c.ws.on('close', (code) => r(code)));
    await api().post('/v1/auth/logout').set(u.auth).expect(200);
    expect(await closed).toBe(4001);
  });
});

describe('account deletion', () => {
  it('requires the password, then removes data, media files and sessions', async () => {
    const u = await makeUser('leaving');
    const friend = await makeUser();
    await befriend(u, friend);
    await api().put('/v1/locations/settings').set(u.auth).send({ mode: 'ALL' });
    await api().post('/v1/locations').set(u.auth).send({ lat: 1, lng: 2, capturedAt: new Date().toISOString() }).expect(200);
    const img = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).jpeg().toBuffer();
    const m = await api().post('/v1/media').set(u.auth).field('kind', 'PHOTO').attach('file', img, 'a.jpg').expect(201);
    await api().post('/v1/photos').set(u.auth).send({ mediaId: m.body.id, recipientIds: [friend.id] }).expect(201);

    const exp = await api().get('/v1/me/export').set(u.auth).expect(200);
    expect(exp.body.user.username).toBe('leaving');
    expect(exp.body.friends).toEqual([friend.id]);

    await api().delete('/v1/me').set(u.auth).send({ password: 'wrong password!' }).expect(401);
    await api().delete('/v1/me').set(u.auth).send({ password: 'correct horse battery' }).expect(200);

    expect(await db.user.count({ where: { id: u.id } })).toBe(0);
    expect(await db.friendship.count()).toBe(0);
    expect(await db.currentLocation.count()).toBe(0);
    expect(await db.mediaObject.count()).toBe(0);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(existsSync(mediaPath(m.body.id))).toBe(false);
    expect(await db.auditEvent.count({ where: { userId: u.id } })).toBe(0);
    await api().get('/v1/me').set(u.auth).expect(401);
    await api().post('/v1/auth/login').send({ email: 'leaving@test.local', password: 'correct horse battery' }).expect(401);
  });
});

describe('abuse controls', () => {
  it('rate-limits login attempts per email', async () => {
    limits.enabled = true;
    try {
      const codes = [];
      for (let i = 0; i < 12; i++) codes.push((await api().post('/v1/auth/login').send({ email: 'target@test.local', password: 'guess guess guess' })).status);
      expect(codes).toContain(429);
    } finally {
      limits.enabled = false;
    }
  });

  it('rejects oversized JSON bodies', async () => {
    const u = await makeUser();
    await api().patch('/v1/me').set(u.auth).set('Content-Type', 'application/json').send(JSON.stringify({ bio: 'x'.repeat(2_000_000) })).expect(413);
  });

  it('never leaks stack traces', async () => {
    const r = await api().post('/v1/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts|node_modules/);
  });
});

describe('log hygiene', () => {
  it('redacts credentials, tokens and ciphertext', () => {
    const lines: string[] = [];
    const log = pino(
      { redact: { paths: redactPaths, censor: '[redacted]' } },
      new Writable({ write: (c, _e, cb) => (lines.push(c.toString()), cb()) }),
    );
    log.info({
      req: { headers: { authorization: 'Bearer SECRET_ACCESS' } },
      body: { password: 'SECRET_PW', refreshToken: 'SECRET_RT', ciphertext: 'SECRET_CT', idToken: 'SECRET_ID' },
    });
    expect(lines.join('')).not.toMatch(/SECRET_/);
  });
});
