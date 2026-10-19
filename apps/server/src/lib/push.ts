import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import { db } from './db.js';
import { logger } from './logger.js';

type Kind = 'friendRequests' | 'photos' | 'messages' | 'security';

// Generic copy only. Encrypted message content never reaches the server, so it can never reach a push payload.
const COPY: Record<Kind, { title: string; body: string }> = {
  friendRequests: { title: 'Vybe', body: 'You have a new friend update' },
  photos: { title: 'Vybe', body: 'A friend sent you a photo' },
  messages: { title: 'Vybe', body: 'New message' },
  security: { title: 'Vybe', body: 'Security alert on your account' },
};

let messaging: import('firebase-admin/messaging').Messaging | null | undefined;

async function fcm() {
  if (messaging !== undefined) return messaging;
  if (!config.FCM_SERVICE_ACCOUNT_PATH) {
    logger.warn('FCM_SERVICE_ACCOUNT_PATH not set; push notifications disabled');
    return (messaging = null);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(config.FCM_SERVICE_ACCOUNT_PATH, 'utf8'))) });
  return (messaging = getMessaging(app));
}

/** Push a generic notification to every live session of `userId`, honoring prefs and chat mutes. */
export async function push(userId: string, kind: Kind, data: Record<string, string> = {}, fromUserId?: string) {
  if (config.NODE_ENV === 'test') return;
  try {
    const prefs = await db.notificationPrefs.findUnique({ where: { userId } });
    if (prefs && !prefs[kind]) return;
    if (kind === 'messages' && fromUserId) {
      const mute = await db.chatMute.findUnique({ where: { userId_peerId: { userId, peerId: fromUserId } } });
      if (mute && (!mute.until || mute.until > new Date())) return;
    }
    const m = await fcm();
    if (!m) return;
    const sessions = await db.session.findMany({
      where: { userId, revokedAt: null, pushToken: { not: null }, expiresAt: { gt: new Date() } },
      select: { id: true, pushToken: true },
    });
    for (const s of sessions) {
      await m
        .send({ token: s.pushToken!, notification: COPY[kind], data: { kind, ...data }, android: { priority: 'high' } })
        .catch(async (err: { code?: string }) => {
          // Token rotated or app uninstalled: forget it.
          if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-argument') {
            await db.session.update({ where: { id: s.id }, data: { pushToken: null } });
          } else logger.warn({ code: err.code }, 'push failed');
        });
    }
  } catch (err) {
    logger.error({ err }, 'push error');
  }
}
