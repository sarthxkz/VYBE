import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { canViewPhoto, friendIds } from '../../lib/authz.js';
import { badRequest, notFound, parse } from '../../lib/errors.js';
import { deleteMedia } from '../../lib/media.js';
import { push } from '../../lib/push.js';
import { emit } from '../../realtime.js';
import { publicUserSelect } from '../users/routes.js';

const PAGE = 30;
const cursorQuery = z.object({ cursor: z.iso.datetime().optional() });

const postSelect = {
  id: true,
  caption: true,
  instant: true,
  expiresAt: true,
  createdAt: true,
  mediaId: true,
  media: { select: { width: true, height: true } },
  sender: { select: publicUserSelect },
} as const;

/** Instants: view once, gone after opening or after this long. */
export const INSTANT_TTL_MS = 24 * 3600_000;

export const photosRouter = Router();
photosRouter.use(requireAuth);

photosRouter.post('/photos', async (req, res) => {
  const body = parse(
    z.object({
      mediaId: z.uuid(),
      caption: z.string().trim().max(200).optional(),
      recipientIds: z.array(z.uuid()).min(1).max(500), // "all friends"
      instant: z.boolean().optional(),
    }),
    req.body,
  );
  const me = uid(req);
  const media = await db.mediaObject.findUnique({ where: { id: body.mediaId }, include: { photoPost: true, story: true } });
  if (!media || media.ownerId !== me || media.kind !== 'PHOTO' || media.photoPost || media.story) throw badRequest('INVALID_MEDIA');
  // The audience is re-checked here: only current, unblocked friends can receive.
  const friends = new Set(await friendIds(me));
  const recipients = [...new Set(body.recipientIds)];
  if (recipients.some((r) => !friends.has(r))) throw badRequest('RECIPIENT_NOT_FRIEND');
  const post = await db.photoPost.create({
    data: {
      senderId: me,
      mediaId: media.id,
      caption: body.caption || null,
      ...(body.instant && { instant: true, expiresAt: new Date(Date.now() + INSTANT_TTL_MS) }),
      recipients: { create: recipients.map((recipientId) => ({ recipientId })) },
    },
    select: { id: true, createdAt: true },
  });
  for (const r of recipients) {
    emit(r, { type: 'photo:new', data: { postId: post.id, senderId: me, instant: !!body.instant } });
    void push(r, 'photos', { type: 'photo', postId: post.id });
  }
  res.status(201).json(post);
});

/** Photos sent to me by people I have not blocked (and who have not blocked me). */
photosRouter.get('/photos/inbox', async (req, res) => {
  const { cursor } = parse(cursorQuery, req.query);
  const me = uid(req);
  const rows = await db.photoRecipient.findMany({
    where: {
      recipientId: me,
      ...(cursor && { createdAt: { lt: new Date(cursor) } }),
      // Instants vanish from the inbox once opened or expired.
      NOT: { post: { instant: true }, OR: [{ viewedAt: { not: null } }, { post: { expiresAt: { lt: new Date() } } }] },
      post: { sender: { blocking: { none: { blockedId: me } }, blockedBy: { none: { blockerId: me } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: PAGE,
    select: { viewedAt: true, createdAt: true, post: { select: postSelect } },
  });
  res.json({
    items: rows.map((r) => ({ ...r.post, viewedAt: r.viewedAt })),
    nextCursor: rows.length === PAGE ? rows.at(-1)!.createdAt.toISOString() : null,
  });
});

photosRouter.get('/photos/sent', async (req, res) => {
  const { cursor } = parse(cursorQuery, req.query);
  const rows = await db.photoPost.findMany({
    where: { senderId: uid(req), ...(cursor && { createdAt: { lt: new Date(cursor) } }) },
    orderBy: { createdAt: 'desc' },
    take: PAGE,
    select: { ...postSelect, recipients: { select: { viewedAt: true, recipient: { select: publicUserSelect } } } },
  });
  res.json({ items: rows, nextCursor: rows.length === PAGE ? rows.at(-1)!.createdAt.toISOString() : null });
});

photosRouter.get('/photos/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  if (!(await canViewPhoto(id, uid(req)))) throw notFound();
  res.json(await db.photoPost.findUniqueOrThrow({ where: { id }, select: postSelect }));
});

photosRouter.post('/photos/:id/viewed', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  await db.photoRecipient.updateMany({ where: { postId: id, recipientId: uid(req), viewedAt: null }, data: { viewedAt: new Date() } });
  res.json({ ok: true });
});

/** Sender: delete for everyone (the file is removed). Recipient: remove from my inbox. */
photosRouter.delete('/photos/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const me = uid(req);
  const post = await db.photoPost.findUnique({ where: { id }, select: { senderId: true, mediaId: true } });
  if (!post) throw notFound();
  if (post.senderId === me) {
    await deleteMedia([post.mediaId]); // cascades to the post and recipients
  } else {
    const r = await db.photoRecipient.deleteMany({ where: { postId: id, recipientId: me } });
    if (!r.count) throw notFound();
  }
  res.json({ ok: true });
});
