import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { authenticate } from './lib/auth.js';
import { canMessage, friendIds } from './lib/authz.js';
import { db } from './lib/db.js';

export type ServerEvent =
  | { type: 'hello'; data: { userId: string } }
  | { type: 'location:update'; data: { userId: string; lat: number; lng: number; accuracy: number | null; capturedAt: string; receivedAt: string } }
  | { type: 'location:removed'; data: { userId: string } }
  | { type: 'message:new'; data: { id: string; senderId: string; type: number; body: string; createdAt: string } }
  | { type: 'message:delivered'; data: { clientMsgId: string; recipientId: string } }
  | { type: 'typing'; data: { userId: string; on: boolean } }
  | { type: 'presence'; data: { userId: string; online: boolean; lastActiveAt: string | null } }
  | { type: 'friend:request'; data: { requestId: string; fromId: string } }
  | { type: 'friend:accepted'; data: { userId: string } }
  | { type: 'friend:removed'; data: { userId: string } }
  | { type: 'friend:mood'; data: { userId: string } }
  | { type: 'photo:new'; data: { postId: string; senderId: string } }
  | { type: 'story:new'; data: { userId: string } }
  | { type: 'keys:changed'; data: { userId: string } }
  | { type: 'error'; data: { code: string } };

type Sock = WebSocket & { userId: string; sid: string; alive: boolean; lastTyping: number };
const byUser = new Map<string, Set<Sock>>();

export const isOnline = (userId: string) => (byUser.get(userId)?.size ?? 0) > 0;

/** Live connection counts (admin panel). */
export const realtimeStats = () => ({ usersOnline: byUser.size, sockets: [...byUser.values()].reduce((n, s) => n + s.size, 0) });

export function emit(userId: string, event: ServerEvent) {
  const set = byUser.get(userId);
  if (!set) return false;
  const msg = JSON.stringify(event);
  for (const s of set) if (s.readyState === s.OPEN) s.send(msg);
  return set.size > 0;
}

export const emitMany = (userIds: Iterable<string>, event: ServerEvent) => {
  for (const id of userIds) emit(id, event);
};

/** Close sockets for a revoked session, or all of a user's sockets. */
export function disconnect(userId: string, sid?: string) {
  for (const s of byUser.get(userId) ?? []) if (!sid || s.sid === sid) s.close(4001, 'session ended');
}

async function broadcastPresence(userId: string, online: boolean) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { showPresence: true, lastActiveAt: true } });
  if (!u?.showPresence) return;
  emitMany(await friendIds(userId), {
    type: 'presence',
    data: { userId, online, lastActiveAt: u.lastActiveAt?.toISOString() ?? null },
  });
}

const clientEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('typing'), data: z.object({ to: z.uuid(), on: z.boolean() }) }),
  z.object({ type: z.literal('ping') }),
]);

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

  server.on('upgrade', async (req, socket, head) => {
    try {
      if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') throw new Error('path');
      const h = req.headers.authorization;
      if (!h?.startsWith('Bearer ')) throw new Error('no token');
      const user = await authenticate(h.slice(7));
      wss.handleUpgrade(req, socket, head, (ws) => {
        const s = Object.assign(ws, { userId: user.id, sid: user.sid, alive: true, lastTyping: 0 }) as Sock;
        // The socket lives no longer than its access token; the client reconnects with a fresh one.
        const ttl = setTimeout(() => s.close(4001, 'token expired'), Math.max(0, user.exp * 1000 - Date.now()));
        s.on('close', () => clearTimeout(ttl));
        wss.emit('connection', s);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (s: Sock) => {
    const set = byUser.get(s.userId) ?? new Set();
    const first = set.size === 0;
    set.add(s);
    byUser.set(s.userId, set);
    s.send(JSON.stringify({ type: 'hello', data: { userId: s.userId } } satisfies ServerEvent));
    if (first) void broadcastPresence(s.userId, true).catch(() => {});

    s.on('pong', () => (s.alive = true));
    s.on('message', async (raw) => {
      let ev: z.infer<typeof clientEvent>;
      try {
        ev = clientEvent.parse(JSON.parse(raw.toString()));
      } catch {
        return s.send(JSON.stringify({ type: 'error', data: { code: 'BAD_EVENT' } }));
      }
      if (ev.type === 'ping') return;
      // Typing events are cheap to send but cost DB lookups here; drop bursts.
      if (Date.now() - s.lastTyping < 1000) return;
      s.lastTyping = Date.now();
      if (!(await canMessage(s.userId, ev.data.to))) {
        return s.send(JSON.stringify({ type: 'error', data: { code: 'FORBIDDEN' } }));
      }
      emit(ev.data.to, { type: 'typing', data: { userId: s.userId, on: ev.data.on } });
    });
    s.on('close', async () => {
      set.delete(s);
      if (set.size === 0) {
        byUser.delete(s.userId);
        await db.user.update({ where: { id: s.userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
        void broadcastPresence(s.userId, false).catch(() => {});
      }
    });
  });

  // Drop dead connections (mobile networks often vanish without a FIN).
  const heartbeat = setInterval(() => {
    for (const set of byUser.values())
      for (const s of set) {
        if (!s.alive) s.terminate();
        else {
          s.alive = false;
          s.ping();
        }
      }
  }, 30_000);

  return {
    close: () => {
      clearInterval(heartbeat);
      for (const set of byUser.values()) for (const s of set) s.close(1001, 'server shutting down');
      wss.close();
    },
  };
}
