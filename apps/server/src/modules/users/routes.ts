import { Router } from 'express';
import { z } from 'zod';
import { db, ordered, pairKey } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { isBlockedEither } from '../../lib/authz.js';
import { badRequest, conflict, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { deleteMedia } from '../../lib/media.js';
import { Prisma } from '../../generated/prisma/client.js';

export const publicUserSelect = { id: true, username: true, displayName: true, avatarMediaId: true, bio: true } as const;

export type Relationship = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

async function relationship(me: string, other: string): Promise<Relationship> {
  if (me === other) return 'self';
  const [userAId, userBId] = ordered(me, other);
  if (await db.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } })) return 'friends';
  const req = await db.friendRequest.findUnique({ where: { pairKey: pairKey(me, other) } });
  if (req) return req.fromId === me ? 'request_sent' : 'request_received';
  return 'none';
}

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/me', async (req, res) => {
  const u = await db.user.findUniqueOrThrow({
    where: { id: uid(req) },
    select: {
      ...publicUserSelect,
      email: true,
      emailVerifiedAt: true,
      showPresence: true,
      createdAt: true,
      passwordHash: true,
      googleSub: true,
      role: true,
    },
  });
  const { passwordHash, googleSub, ...rest } = u;
  res.json({ ...rest, hasPassword: !!passwordHash, hasGoogle: !!googleSub });
});

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,20}$/, '3-20 characters: letters, numbers, _ and .')
  .refine((s) => !/^\.|\.$|\.\./.test(s), 'no leading, trailing or double dots');

usersRouter.patch('/me', async (req, res) => {
  const body = parse(
    z
      .object({
        username,
        displayName: z.string().trim().min(1).max(40),
        bio: z.string().trim().max(160).nullable(),
        avatarMediaId: z.uuid().nullable(),
        showPresence: z.boolean(),
      })
      .partial()
      .strict(),
    req.body,
  );
  const me = uid(req);
  if (body.avatarMediaId) {
    const m = await db.mediaObject.findUnique({ where: { id: body.avatarMediaId } });
    if (!m || m.ownerId !== me || m.kind !== 'AVATAR') throw badRequest('INVALID_AVATAR');
  }
  const old = await db.user.findUniqueOrThrow({ where: { id: me }, select: { avatarMediaId: true } });
  try {
    const u = await db.user.update({ where: { id: me }, data: body, select: { ...publicUserSelect, showPresence: true } });
    // Old avatar file is garbage once replaced.
    if (body.avatarMediaId !== undefined && old.avatarMediaId && old.avatarMediaId !== body.avatarMediaId) {
      await deleteMedia([old.avatarMediaId]);
    }
    res.json(u);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('USERNAME_TAKEN');
    throw e;
  }
});

usersRouter.get('/username-available', async (req, res) => {
  const name = parse(username, req.query.username);
  const taken = await db.user.findFirst({ where: { username: name, id: { not: uid(req) } }, select: { id: true } });
  res.json({ available: !taken });
});

usersRouter.put('/me/push-token', async (req, res) => {
  const body = parse(z.object({ token: z.string().min(10).max(4096).nullable() }), req.body);
  await db.$transaction([
    // A token belongs to one install; move it if another session had it.
    ...(body.token ? [db.session.updateMany({ where: { pushToken: body.token }, data: { pushToken: null } })] : []),
    db.session.update({ where: { id: req.user!.sid }, data: { pushToken: body.token } }),
  ]);
  res.json({ ok: true });
});

usersRouter.get('/me/notifications', async (req, res) => {
  res.json(await db.notificationPrefs.upsert({ where: { userId: uid(req) }, create: { userId: uid(req) }, update: {} }));
});

usersRouter.put('/me/notifications', async (req, res) => {
  const body = parse(
    z.object({ friendRequests: z.boolean(), photos: z.boolean(), messages: z.boolean(), security: z.boolean() }).partial().strict(),
    req.body,
  );
  res.json(await db.notificationPrefs.upsert({ where: { userId: uid(req) }, create: { userId: uid(req), ...body }, update: body }));
});

usersRouter.put('/me/mutes/:peerId', async (req, res) => {
  const peerId = parse(z.uuid(), req.params.peerId);
  const { until } = parse(z.object({ until: z.iso.datetime().nullable() }), req.body);
  const data = { until: until ? new Date(until) : null };
  await db.chatMute.upsert({ where: { userId_peerId: { userId: uid(req), peerId } }, create: { userId: uid(req), peerId, ...data }, update: data });
  res.json({ ok: true });
});

usersRouter.delete('/me/mutes/:peerId', async (req, res) => {
  const peerId = parse(z.uuid(), req.params.peerId);
  await db.chatMute.deleteMany({ where: { userId: uid(req), peerId } });
  res.json({ ok: true });
});

usersRouter.get('/me/mutes', async (req, res) => {
  res.json({ mutes: await db.chatMute.findMany({ where: { userId: uid(req) }, select: { peerId: true, until: true } }) });
});

// Prefix search on username only. Min 3 chars + rate limit to make scraping slow.
usersRouter.get('/users/search', rl.search, async (req, res) => {
  const q = parse(z.string().trim().toLowerCase().min(3).max(20).regex(/^[a-z0-9_.]+$/), req.query.q);
  const me = uid(req);
  const users = await db.user.findMany({
    where: {
      username: { startsWith: q },
      id: { not: me },
      suspendedAt: null,
      blocking: { none: { blockedId: me } },
      blockedBy: { none: { blockerId: me } },
    },
    select: publicUserSelect,
    orderBy: { username: 'asc' },
    take: 20,
  });
  res.json({ users: await Promise.all(users.map(async (u) => ({ ...u, relationship: await relationship(me, u.id) }))) });
});

usersRouter.get('/users/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const me = uid(req);
  if (id !== me && (await isBlockedEither(me, id))) throw notFound();
  const u = await db.user.findUnique({ where: { id, suspendedAt: null }, select: publicUserSelect });
  if (!u) throw notFound();
  res.json({ ...u, relationship: await relationship(me, id) });
});
