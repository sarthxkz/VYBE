import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { friendIds, isSharingActive, locationViewers, locationVisibleOwners } from '../../lib/authz.js';
import { badRequest, conflict, parse } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { emitMany } from '../../realtime.js';
import { moodSelect, publicUserSelect, withMood } from '../users/routes.js';

/** Locations older than this are deleted and never shown. */
export const LOCATION_MAX_AGE_MS = 24 * 3600_000;
/** Server-enforced minimum gap between uploads (client targets 120 s). */
const MIN_UPLOAD_GAP_MS = 20_000;
// shortcut: per-process memory; fine for one API process, use Redis if scaled out.
const lastUpload = new Map<string, number>();

/** Delete my live position and tell everyone who could see it. */
export async function withdrawLocation(userId: string, viewersBefore?: string[]) {
  const viewers = viewersBefore ?? (await friendIds(userId));
  await db.currentLocation.deleteMany({ where: { userId } });
  emitMany(viewers, { type: 'location:removed', data: { userId } });
}

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

locationsRouter.get('/locations/settings', async (req, res) => {
  const me = uid(req);
  const s = await db.locationSettings.upsert({ where: { userId: me }, create: { userId: me }, update: {} });
  const grants = await db.locationGrant.findMany({ where: { ownerId: me }, select: { viewerId: true } });
  res.json({ ...s, active: isSharingActive(s), grants: grants.map((g) => g.viewerId) });
});

locationsRouter.put('/locations/settings', async (req, res) => {
  const body = parse(
    z
      .object({
        mode: z.enum(['OFF', 'ALL', 'SELECTED']),
        ghost: z.boolean(),
        // Temporary sharing window, up to 7 days ahead. null = no expiry.
        expiresAt: z.iso.datetime().nullable(),
        grants: z.array(z.uuid()).max(500),
      })
      .partial()
      .strict(),
    req.body,
  );
  const me = uid(req);
  if (body.expiresAt) {
    const t = new Date(body.expiresAt).getTime();
    if (t <= Date.now() || t > Date.now() + 7 * 24 * 3600_000) throw badRequest('INVALID_EXPIRY');
  }
  const viewersBefore = await locationViewers(me);
  const updated = await db.$transaction(async (tx) => {
    const s = await tx.locationSettings.upsert({
      where: { userId: me },
      create: { userId: me, mode: body.mode, ghost: body.ghost, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
      update: {
        mode: body.mode,
        ghost: body.ghost,
        expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    if (body.grants) {
      // Only current friends can be granted.
      const friends = new Set(await friendIds(me, tx));
      const valid = [...new Set(body.grants)].filter((id) => friends.has(id));
      await tx.locationGrant.deleteMany({ where: { ownerId: me } });
      await tx.locationGrant.createMany({ data: valid.map((viewerId) => ({ ownerId: me, viewerId })) });
    }
    return s;
  });
  if (!isSharingActive(updated)) {
    // Ghost Mode / off: the stored position is deleted immediately, not just hidden.
    await withdrawLocation(me, viewersBefore);
  } else {
    const after = new Set(await locationViewers(me));
    emitMany(viewersBefore.filter((v) => !after.has(v)), { type: 'location:removed', data: { userId: me } });
  }
  if (body.ghost !== undefined) audit(body.ghost ? 'location.ghost_on' : 'location.ghost_off', me, req);
  const grants = await db.locationGrant.findMany({ where: { ownerId: me }, select: { viewerId: true } });
  res.json({ ...updated, active: isSharingActive(updated), grants: grants.map((g) => g.viewerId) });
});

locationsRouter.post('/locations', async (req, res) => {
  const body = parse(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100_000).nullable().optional(),
      capturedAt: z.iso.datetime(),
    }),
    req.body,
  );
  const me = uid(req);
  const settings = await db.locationSettings.findUnique({ where: { userId: me } });
  if (!isSharingActive(settings)) {
    // Covers expired temporary sessions too: make sure nothing lingers.
    await withdrawLocation(me);
    throw conflict('SHARING_OFF', 'Location sharing is off');
  }
  const captured = new Date(body.capturedAt).getTime();
  const now = Date.now();
  if (captured > now + 60_000 || captured < now - 15 * 60_000) throw badRequest('STALE_OR_FUTURE_TIMESTAMP');
  const last = lastUpload.get(me) ?? 0;
  if (now - last < MIN_UPLOAD_GAP_MS) {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too frequent' }, retryAfterMs: MIN_UPLOAD_GAP_MS - (now - last) });
    return;
  }
  lastUpload.set(me, now);
  const data = { lat: body.lat, lng: body.lng, accuracy: body.accuracy ?? null, capturedAt: new Date(captured), receivedAt: new Date() };
  await db.currentLocation.upsert({ where: { userId: me }, create: { userId: me, ...data }, update: data });
  emitMany(await locationViewers(me), {
    type: 'location:update',
    data: { userId: me, ...data, capturedAt: data.capturedAt.toISOString(), receivedAt: data.receivedAt.toISOString() },
  });
  res.json({ ok: true, receivedAt: data.receivedAt, nextInMs: 120_000 });
});

locationsRouter.delete('/locations/me', async (req, res) => {
  await withdrawLocation(uid(req));
  res.json({ ok: true });
});

/** All friends, with a location only where the sharing policy allows it right now. */
locationsRouter.get('/locations/friends', async (req, res) => {
  const me = uid(req);
  const ids = await friendIds(me);
  const visible = await locationVisibleOwners(me, ids);
  const [users, locs] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { ...publicUserSelect, ...moodSelect } }).then((us) => us.map(withMood)),
    db.currentLocation.findMany({
      where: { userId: { in: [...visible] }, receivedAt: { gt: new Date(Date.now() - LOCATION_MAX_AGE_MS) } },
    }),
  ]);
  const byId = new Map(locs.map((l) => [l.userId, l]));
  res.json({
    friends: users.map((u) => {
      const l = byId.get(u.id);
      return {
        user: u,
        sharing: visible.has(u.id),
        location: l ? { lat: l.lat, lng: l.lng, accuracy: l.accuracy, capturedAt: l.capturedAt, receivedAt: l.receivedAt } : null,
      };
    }),
  });
});
