import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { friendIds } from '../../lib/authz.js';
import { notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { emitMany } from '../../realtime.js';
import { oneEmoji, publicUserSelect } from '../users/routes.js';

// Event pins: created by a user, visible to that user's current friends (blocks remove friendship) until they end.
const MAX_AHEAD_MS = 7 * 24 * 3600_000;
const MAX_LENGTH_MS = 24 * 3600_000;

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/events', async (req, res) => {
  const me = uid(req);
  const events = await db.event.findMany({
    where: { creatorId: { in: [me, ...(await friendIds(me))] }, endsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 200,
    select: { id: true, title: true, emoji: true, lat: true, lng: true, startsAt: true, endsAt: true, creator: { select: publicUserSelect } },
  });
  res.json({ events });
});

eventsRouter.post('/events', rl.events, async (req, res) => {
  const body = parse(
    z
      .object({
        title: z.string().trim().min(1).max(40),
        emoji: oneEmoji,
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
      })
      .strict()
      .refine((e) => e.endsAt > e.startsAt && e.endsAt.getTime() - e.startsAt.getTime() <= MAX_LENGTH_MS, 'events last up to 24 hours')
      .refine((e) => e.endsAt > new Date() && e.startsAt.getTime() < Date.now() + MAX_AHEAD_MS, 'events must end in the future and start within 7 days'),
    req.body,
  );
  const me = uid(req);
  const ev = await db.event.create({ data: { ...body, creatorId: me }, select: { id: true } });
  emitMany(await friendIds(me), { type: 'event:changed', data: { eventId: ev.id } });
  res.status(201).json(ev);
});

eventsRouter.delete('/events/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const me = uid(req);
  const r = await db.event.deleteMany({ where: { id, creatorId: me } });
  if (!r.count) throw notFound();
  emitMany(await friendIds(me), { type: 'event:changed', data: { eventId: id } });
  res.json({ ok: true });
});
