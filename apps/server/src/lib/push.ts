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

// The app's channels (features/alerts.ts, features/notifications.ts): messages and photos ring at max importance.
const CHANNEL: Record<Kind, string> = { messages: 'messages', photos: 'photos', friendRequests: 'default', security: 'default' };

let messaging: import('firebase-admin/messaging').Messaging | null | undefined;

async function fcm() {
  if (messaging !== undefined) return messaging;
  const json = config.FCM_SERVICE_ACCOUNT_B64
    ? Buffer.from(config.FCM_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
    : config.FCM_SERVICE_ACCOUNT_PATH && readFileSync(config.FCM_SERVICE_ACCOUNT_PATH, 'utf8');
  if (!json) {
    logger.warn('No FCM service account set; push notifications disabled');
    return (messaging = null);
  }
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({ credential: cert(JSON.parse(json)) });
  logger.info('FCM push enabled');
  return (messaging = getMessaging(app));
}

/** Push a generic notification to every live session of `userId`, honoring prefs and chat mutes. */
export async function push(userId: string, kind: Kind, data: Record<string, string> = {}, fromUserId?: string, copy = COPY[kind]) {
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
        .send({ token: s.pushToken!, notification: copy, data: { kind, ...data }, android: { priority: 'high', notification: { channelId: CHANNEL[kind], sound: 'default', defaultVibrateTimings: true } } })
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

/** Friend request / accepted, naming who (names aren't secret: the recipient sees them in the app anyway). */
export async function pushFriend(userId: string, fromUserId: string, type: 'friend_request' | 'friend_accepted') {
  const u = await db.user.findUnique({ where: { id: fromUserId }, select: { displayName: true, username: true } }).catch(() => null);
  const who = (u?.displayName ?? (u?.username ? `@${u.username}` : 'Someone')).slice(0, 60);
  const copy =
    type === 'friend_request'
      ? { title: '👋 New friend request', body: `${who} wants to be your friend on Vybe` }
      : { title: '🎉 New friend', body: `${who} accepted your friend request` };
  await push(userId, 'friendRequests', { type, url: type === 'friend_request' ? '/friends' : `/user/${fromUserId}` }, fromUserId, copy);
}
