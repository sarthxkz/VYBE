import { Router } from 'express';
import { z } from 'zod';
import { db, ordered, pairKey, type Tx } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { friendIds, isBlockedEither } from '../../lib/authz.js';
import { badRequest, conflict, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { audit } from '../../lib/audit.js';
import { pushFriend } from '../../lib/push.js';
import { emit, isOnline } from '../../realtime.js';
import { Prisma } from '../../generated/prisma/client.js';
import { moodSelect, publicUserSelect, withMood } from '../users/routes.js';

/** Removes everything two users shared once they stop being friends. */
async function severPair(tx: Tx, a: string, b: string) {
  const [userAId, userBId] = ordered(a, b);
  await tx.friendship.deleteMany({ where: { userAId, userBId } });
  await tx.friendRequest.deleteMany({ where: { pairKey: pairKey(a, b) } });
  await tx.locationGrant.deleteMany({ where: { OR: [{ ownerId: a, viewerId: b }, { ownerId: b, viewerId: a }] } });
  await tx.encryptedMessage.deleteMany({ where: { OR: [{ senderId: a, recipientId: b }, { senderId: b, recipientId: a }] } });
}

function notifySevered(a: string, b: string) {
  emit(a, { type: 'friend:removed', data: { userId: b } });
  emit(b, { type: 'friend:removed', data: { userId: a } });
  emit(a, { type: 'location:removed', data: { userId: b } });
  emit(b, { type: 'location:removed', data: { userId: a } });
}

async function makeFriends(tx: Tx, a: string, b: string, requestId: string) {
  const [userAId, userBId] = ordered(a, b);
  await tx.friendRequest.delete({ where: { id: requestId } });
  await tx.friendship.createMany({ data: [{ userAId, userBId }], skipDuplicates: true });
}

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

friendsRouter.get('/friends', async (req, res) => {
  const me = uid(req);
  const ids = await friendIds(me);
  const users = (await db.user.findMany({ where: { id: { in: ids } }, select: { ...publicUserSelect, ...moodSelect, showPresence: true, lastActiveAt: true } })).map(withMood);
  res.json({
    friends: users
      .map(({ showPresence, lastActiveAt, ...u }) => ({
        ...u,
        online: showPresence ? isOnline(u.id) : null,
        lastActiveAt: showPresence ? lastActiveAt : null,
      }))
      .sort((x, y) => (x.displayName ?? x.username ?? '').localeCompare(y.displayName ?? y.username ?? '')),
  });
});

friendsRouter.get('/friends/requests', async (req, res) => {
  const me = uid(req);
  const [incoming, outgoing] = await Promise.all([
    db.friendRequest.findMany({ where: { toId: me }, include: { from: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' } }),
    db.friendRequest.findMany({ where: { fromId: me }, include: { to: { select: publicUserSelect } }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({
    incoming: incoming.map((r) => ({ id: r.id, createdAt: r.createdAt, user: r.from })),
    outgoing: outgoing.map((r) => ({ id: r.id, createdAt: r.createdAt, user: r.to })),
  });
});

friendsRouter.post('/friends/requests', rl.friendRequest, async (req, res) => {
  const { userId } = parse(z.object({ userId: z.uuid() }), req.body);
  const me = uid(req);
  if (userId === me) throw badRequest('CANNOT_FRIEND_SELF');
  const target = await db.user.findUnique({ where: { id: userId, suspendedAt: null }, select: { id: true, username: true } });
  // Blocked looks identical to "no such user" so blocks are not revealed.
  if (!target?.username || (await isBlockedEither(me, userId))) throw notFound('USER_NOT_FOUND');

  const run = () =>
    db.$transaction(async (tx) => {
      const [userAId, userBId] = ordered(me, userId);
      if (await tx.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } })) return { status: 'friends' as const };
      const existing = await tx.friendRequest.findUnique({ where: { pairKey: pairKey(me, userId) } });
      if (existing?.fromId === me) return { status: 'pending' as const, id: existing.id };
      if (existing) {
        // They already asked us: sending back means yes.
        await makeFriends(tx, me, userId, existing.id);
        return { status: 'accepted' as const };
      }
      const r = await tx.friendRequest.create({ data: { fromId: me, toId: userId, pairKey: pairKey(me, userId) } });
      return { status: 'created' as const, id: r.id };
    });

  let result;
  try {
    result = await run();
  } catch (e) {
    // Lost a race with a concurrent request for the same pair; the second pass sees the winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') result = await run();
    else throw e;
  }
  if (result.status === 'friends') throw conflict('ALREADY_FRIENDS');
  if (result.status === 'created') {
    emit(userId, { type: 'friend:request', data: { requestId: result.id, fromId: me } });
    void pushFriend(userId, me, 'friend_request');
  }
  if (result.status === 'accepted') {
    emit(userId, { type: 'friend:accepted', data: { userId: me } });
    void pushFriend(userId, me, 'friend_accepted');
  }
  res.status(result.status === 'created' ? 201 : 200).json(result);
});

friendsRouter.post('/friends/requests/:id/accept', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const me = uid(req);
  const r = await db.friendRequest.findUnique({ where: { id } });
  if (!r || r.toId !== me) throw notFound();
  if (await isBlockedEither(me, r.fromId)) throw notFound();
  try {
    await db.$transaction((tx) => makeFriends(tx, me, r.fromId, id));
  } catch (e) {
    // Already accepted/cancelled concurrently.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw notFound();
    throw e;
  }
  emit(r.fromId, { type: 'friend:accepted', data: { userId: me } });
  void pushFriend(r.fromId, me, 'friend_accepted');
  res.json({ status: 'accepted' });
});

friendsRouter.post('/friends/requests/:id/reject', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const r = await db.friendRequest.deleteMany({ where: { id, toId: uid(req) } });
  if (!r.count) throw notFound();
  res.json({ ok: true });
});

friendsRouter.delete('/friends/requests/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const r = await db.friendRequest.deleteMany({ where: { id, fromId: uid(req) } });
  if (!r.count) throw notFound();
  res.json({ ok: true });
});

friendsRouter.delete('/friends/:userId', async (req, res) => {
  const other = parse(z.uuid(), req.params.userId);
  const me = uid(req);
  await db.$transaction((tx) => severPair(tx, me, other));
  notifySevered(me, other);
  res.json({ ok: true });
});

friendsRouter.get('/blocks', async (req, res) => {
  const rows = await db.block.findMany({
    where: { blockerId: uid(req) },
    include: { blocked: { select: publicUserSelect } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ blocked: rows.map((r) => ({ ...r.blocked, blockedAt: r.createdAt })) });
});

friendsRouter.post('/blocks', async (req, res) => {
  const { userId } = parse(z.object({ userId: z.uuid() }), req.body);
  const me = uid(req);
  if (userId === me) throw badRequest('CANNOT_BLOCK_SELF');
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.block.createMany({ data: [{ blockerId: me, blockedId: userId }], skipDuplicates: true });
    await severPair(tx, me, userId);
  });
  notifySevered(me, userId);
  audit('user.blocked', me, req);
  res.json({ ok: true });
});

friendsRouter.delete('/blocks/:userId', async (req, res) => {
  const other = parse(z.uuid(), req.params.userId);
  await db.block.deleteMany({ where: { blockerId: uid(req), blockedId: other } });
  res.json({ ok: true });
});
