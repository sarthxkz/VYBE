import { Router } from 'express';
import { z } from 'zod';
import { db, ordered, pairKey } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { friendIds, isBlockedEither } from '../../lib/authz.js';
import { badRequest, conflict, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { deleteMedia } from '../../lib/media.js';
import { Prisma } from '../../generated/prisma/client.js';
import { emitMany } from '../../realtime.js';

export const publicUserSelect = { id: true, username: true, displayName: true, avatarMediaId: true, avatarStyle: true, bio: true } as const;

// Moods are friends-only and fade after 24 h. Select these alongside publicUserSelect, then run withMood().
export const moodSelect = { moodEmoji: true, moodText: true, moodSetAt: true } as const;
export const MOOD_TTL_MS = 24 * 60 * 60 * 1000;
type MoodCols = { moodEmoji: string | null; moodText: string | null; moodSetAt: Date | null };
export function withMood<T extends MoodCols>({ moodEmoji, moodText, moodSetAt, ...u }: T) {
  const live = moodEmoji && moodSetAt && Date.now() - moodSetAt.getTime() < MOOD_TTL_MS;
  return { ...u, mood: live ? { emoji: moodEmoji, text: moodText, setAt: moodSetAt } : null };
}

// Each part is an index into the app's part list (apps/mobile/src/ui/character.tsx).
const part = (max: number) => z.number().int().min(0).max(max);
export const avatarStyleSchema = z
  .object({
    skin: part(7), face: part(3), hair: part(9), hairColor: part(9), eyes: part(5), mouth: part(5), accessory: part(5), outfit: part(9),
    // Added 2026-10-20; optional so avatars saved by older app versions stay valid.
    brows: part(4).optional(), nose: part(3).optional(), facialHair: part(4).optional(), eyeColor: part(5).optional(), top: part(4).optional(),
  })
  .strict();

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
      ...moodSelect,
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
  res.json({ ...withMood(rest), hasPassword: !!passwordHash, hasGoogle: !!googleSub });
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
        avatarStyle: avatarStyleSchema.nullable(),
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
    const { avatarStyle, ...rest } = body;
    const data = avatarStyle === undefined ? rest : { ...rest, avatarStyle: avatarStyle ?? Prisma.DbNull };
    const u = await db.user.update({ where: { id: me }, data, select: { ...publicUserSelect, showPresence: true } });
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

// One emoji (any skin tone / ZWJ sequence) plus an optional short line.
const emoji = z
  .string()
  .max(16)
  .regex(/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u{200D}|\u{FE0F})+$/u, 'one emoji')
  .refine((e) => [...new Intl.Segmenter().segment(e)].length === 1, 'one emoji');

usersRouter.put('/me/mood', async (req, res) => {
  const body = parse(z.object({ emoji, text: z.string().trim().max(40).nullable().optional() }).strict(), req.body);
  const me = uid(req);
  const u = await db.user.update({
    where: { id: me },
    data: { moodEmoji: body.emoji, moodText: body.text || null, moodSetAt: new Date() },
    select: moodSelect,
  });
  emitMany(await friendIds(me), { type: 'friend:mood', data: { userId: me } });
  res.json(withMood(u));
});

usersRouter.delete('/me/mood', async (req, res) => {
  const me = uid(req);
  await db.user.update({ where: { id: me }, data: { moodEmoji: null, moodText: null, moodSetAt: null } });
  emitMany(await friendIds(me), { type: 'friend:mood', data: { userId: me } });
  res.json({ mood: null });
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
  const u = await db.user.findUnique({ where: { id, suspendedAt: null }, select: { ...publicUserSelect, ...moodSelect } });
  if (!u) throw notFound();
  const rel = await relationship(me, id);
  const { mood, ...profile } = withMood(u);
  res.json({ ...profile, mood: rel === 'friends' || rel === 'self' ? mood : null, relationship: rel });
});
