import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { canViewStory, friendIds } from '../../lib/authz.js';
import { badRequest, notFound, parse } from '../../lib/errors.js';
import { deleteMedia } from '../../lib/media.js';
import { emitMany } from '../../realtime.js';
import { moodSelect, publicUserSelect, withMood } from '../users/routes.js';

/** Stories show for this long after posting, then jobs.ts deletes them with their file. */
export const STORY_TTL_MS = 24 * 3600_000;
/** A day's cap per person, so one account can't flood everyone's tray. */
export const STORY_DAILY_LIMIT = 30;

const storySelect = { id: true, mediaId: true, caption: true, createdAt: true, expiresAt: true, media: { select: { width: true, height: true } } } as const;

export const storiesRouter = Router();
storiesRouter.use(requireAuth);

/** Post a photo (already uploaded as kind=PHOTO, so EXIF is stripped) to my story. Audience: all current friends. */
storiesRouter.post('/stories', async (req, res) => {
  const body = parse(z.object({ mediaId: z.uuid(), caption: z.string().trim().max(200).optional() }), req.body);
  const me = uid(req);
  const media = await db.mediaObject.findUnique({ where: { id: body.mediaId }, include: { photoPost: true, story: true } });
  if (!media || media.ownerId !== me || media.kind !== 'PHOTO' || media.photoPost || media.story) throw badRequest('INVALID_MEDIA');
  if ((await db.story.count({ where: { userId: me, expiresAt: { gt: new Date() } } })) >= STORY_DAILY_LIMIT) throw badRequest('STORY_LIMIT');
  const story = await db.story.create({
    data: { userId: me, mediaId: media.id, caption: body.caption || null, expiresAt: new Date(Date.now() + STORY_TTL_MS) },
    select: storySelect,
  });
  emitMany(await friendIds(me), { type: 'story:new', data: { userId: me } });
  res.status(201).json(story);
});

/**
 * The story tray: my live stories, then friends with live stories (unseen first, newest first).
 * Friends only, blocks excluded either way (friendIds handles both).
 */
storiesRouter.get('/stories/feed', async (req, res) => {
  const me = uid(req);
  const now = new Date();
  const friends = await friendIds(me);
  const rows = await db.story.findMany({
    where: { userId: { in: [me, ...friends] }, expiresAt: { gt: now } },
    orderBy: { createdAt: 'asc' },
    select: { ...storySelect, userId: true, views: { where: { viewerId: me }, select: { viewedAt: true } }, _count: { select: { views: true } } },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { ...publicUserSelect, ...moodSelect } });
  const byUser = new Map(users.map((u) => [u.id, withMood(u)]));
  const groups = new Map<string, { user: ReturnType<typeof withMood>; stories: unknown[]; unseen: number; latestAt: Date }>();
  for (const { userId, views, _count, ...s } of rows) {
    const user = byUser.get(userId);
    if (!user) continue;
    const g = groups.get(userId) ?? { user, stories: [], unseen: 0, latestAt: s.createdAt };
    const mine = userId === me;
    // Only the owner learns the view count.
    g.stories.push({ ...s, seen: mine || views.length > 0, ...(mine && { viewCount: _count.views }) });
    if (!mine && !views.length) g.unseen++;
    g.latestAt = s.createdAt;
    groups.set(userId, g);
  }
  const mine = groups.get(me) ?? null;
  groups.delete(me);
  const others = [...groups.values()].sort((a, b) => Number(b.unseen > 0) - Number(a.unseen > 0) || b.latestAt.getTime() - a.latestAt.getTime());
  res.json({ mine, friends: others.map(({ latestAt: _l, ...g }) => g) });
});

storiesRouter.post('/stories/:id/view', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const me = uid(req);
  if (!(await canViewStory(id, me))) throw notFound();
  const owner = await db.story.findUniqueOrThrow({ where: { id }, select: { userId: true } });
  if (owner.userId !== me) await db.storyView.upsert({ where: { storyId_viewerId: { storyId: id, viewerId: me } }, create: { storyId: id, viewerId: me }, update: {} });
  res.json({ ok: true });
});

/** Who watched my story. Owner only; people blocked since are left out. */
storiesRouter.get('/stories/:id/viewers', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const me = uid(req);
  const story = await db.story.findUnique({ where: { id }, select: { userId: true } });
  if (!story || story.userId !== me) throw notFound();
  const visible = new Set(await friendIds(me));
  const views = await db.storyView.findMany({ where: { storyId: id }, orderBy: { viewedAt: 'desc' }, select: { viewedAt: true, viewer: { select: publicUserSelect } } });
  res.json({ viewers: views.filter((v) => visible.has(v.viewer.id)) });
});

storiesRouter.delete('/stories/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const story = await db.story.findUnique({ where: { id }, select: { userId: true, mediaId: true } });
  if (!story || story.userId !== uid(req)) throw notFound();
  await deleteMedia([story.mediaId]); // cascades to the story and its views
  res.json({ ok: true });
});
