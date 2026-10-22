import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config.js';
import { db } from '../../lib/db.js';
import { requireAuth, uid, verifyPassword } from '../../lib/auth.js';
import { friendIds } from '../../lib/authz.js';
import { parse, unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { unlinkMedia } from '../../lib/media.js';
import { disconnect, emitMany } from '../../realtime.js';

const google = new OAuth2Client();

export const privacyRouter = Router();
privacyRouter.use(requireAuth);

/** Machine-readable copy of everything the server holds about me. (Chat history lives only on my device.) */
privacyRouter.get('/me/export', async (req, res) => {
  const me = uid(req);
  const user = await db.user.findUniqueOrThrow({
    where: { id: me },
    select: {
      id: true, email: true, username: true, displayName: true, bio: true, avatarMediaId: true, showPresence: true,
      lastActiveAt: true, createdAt: true, emailVerifiedAt: true,
      sessions: { where: { revokedAt: null }, select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true } },
      sentRequests: { select: { toId: true, createdAt: true } },
      receivedRequests: { select: { fromId: true, createdAt: true } },
      blocking: { select: { blockedId: true, createdAt: true } },
      locationSettings: true,
      grantsGiven: { select: { viewerId: true } },
      currentLocation: true,
      photoPosts: { select: { id: true, caption: true, createdAt: true, mediaId: true, recipients: { select: { recipientId: true, viewedAt: true } } } },
      photoReceipts: { select: { postId: true, createdAt: true, viewedAt: true } },
      stories: { select: { id: true, caption: true, createdAt: true, expiresAt: true, mediaId: true, views: { select: { viewerId: true, viewedAt: true } } } },
      storyViews: { select: { storyId: true, viewedAt: true } },
      chatMutes: { select: { peerId: true, until: true } },
      notificationPrefs: true,
      reportsFiled: { select: { id: true, targetUserId: true, reason: true, createdAt: true, status: true } },
      device: { select: { registrationId: true, createdAt: true } },
    },
  });
  const auditEvents = await db.auditEvent.findMany({ where: { userId: me }, select: { type: true, createdAt: true, ip: true }, orderBy: { createdAt: 'desc' }, take: 1000 });
  res.setHeader('Content-Disposition', 'attachment; filename="vybe-export.json"');
  res.json({ exportedAt: new Date(), user, friends: await friendIds(me), auditEvents });
});

/** Permanent deletion. Requires re-authentication. */
privacyRouter.delete('/me', async (req, res) => {
  const body = parse(z.object({ password: z.string().max(128).optional(), googleIdToken: z.string().max(4096).optional() }), req.body);
  const me = uid(req);
  const user = await db.user.findUniqueOrThrow({ where: { id: me } });
  let ok = false;
  if (user.passwordHash && body.password) ok = await verifyPassword(user.passwordHash, body.password);
  else if (!user.passwordHash && user.googleSub && body.googleIdToken && config.GOOGLE_CLIENT_IDS.length) {
    try {
      const p = (await google.verifyIdToken({ idToken: body.googleIdToken, audience: config.GOOGLE_CLIENT_IDS })).getPayload();
      ok = p?.sub === user.googleSub;
    } catch {}
  }
  if (!ok) throw unauthorized('REAUTH_FAILED');

  const friends = await friendIds(me);
  const media = await db.mediaObject.findMany({ where: { ownerId: me }, select: { id: true } });
  await db.$transaction([
    db.auditEvent.deleteMany({ where: { userId: me } }),
    // Cascades remove sessions, keys, friendships, requests, blocks, location data, media rows, photos, pending messages.
    db.user.delete({ where: { id: me } }),
  ]);
  await unlinkMedia(media.map((m) => m.id));
  disconnect(me);
  emitMany(friends, { type: 'friend:removed', data: { userId: me } });
  emitMany(friends, { type: 'location:removed', data: { userId: me } });
  audit('account.deleted', null, undefined, { mediaFiles: media.length });
  res.json({ ok: true });
});
