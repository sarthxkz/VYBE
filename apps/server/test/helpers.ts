import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { attachRealtime } from '../src/realtime.js';
import { db, ordered } from '../src/lib/db.js';
import { hashPassword, issueSession } from '../src/lib/auth.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  // users cascades to nearly everything; audit_events has no FK.
  await db.$executeRawUnsafe('TRUNCATE users, audit_events CASCADE');
}

export type TestUser = { id: string; username: string; token: string; refreshToken: string; auth: { Authorization: string } };

let n = 0;
export async function makeUser(username = `user${++n}_${Date.now() % 100000}`, password = 'correct horse battery'): Promise<TestUser> {
  const u = await db.user.create({
    data: {
      email: `${username}@test.local`,
      username,
      displayName: username,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      notificationPrefs: { create: {} },
      locationSettings: { create: {} },
    },
  });
  const s = await issueSession(u.id, 'test');
  return { id: u.id, username, token: s.accessToken, refreshToken: s.refreshToken, auth: { Authorization: `Bearer ${s.accessToken}` } };
}

export async function befriend(a: TestUser, b: TestUser) {
  const [userAId, userBId] = ordered(a.id, b.id);
  await db.friendship.create({ data: { userAId, userBId } });
}

/** A real HTTP server with the websocket layer, for realtime tests. */
export async function startServer(): Promise<{ url: string; server: Server; close: () => Promise<void> }> {
  const server = createServer(app);
  const rt = attachRealtime(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise((r) => {
        rt.close();
        server.close(() => r());
      }),
  };
}
