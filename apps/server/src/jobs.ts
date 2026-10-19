import { db } from './lib/db.js';
import { logger } from './lib/logger.js';
import { unlinkMedia } from './lib/media.js';
import { LOCATION_MAX_AGE_MS, withdrawLocation } from './modules/locations/routes.js';
import { MESSAGE_TTL_MS } from './modules/messages/routes.js';

const ago = (ms: number) => new Date(Date.now() - ms);

/** Retention enforcement. Safe to run repeatedly. */
export async function runCleanup() {
  // Locations: drop old positions, and positions of anyone whose sharing is no longer active.
  await db.currentLocation.deleteMany({ where: { receivedAt: { lt: ago(LOCATION_MAX_AGE_MS) } } });
  const inactive = await db.currentLocation.findMany({
    where: { user: { locationSettings: { OR: [{ mode: 'OFF' }, { ghost: true }, { expiresAt: { lt: new Date() } }] } } },
    select: { userId: true },
  });
  for (const { userId } of inactive) await withdrawLocation(userId);

  await db.encryptedMessage.deleteMany({ where: { createdAt: { lt: ago(MESSAGE_TTL_MS) } } });

  // Media uploaded but never attached (abandoned uploads), and chat blobs past the message TTL.
  const orphans = await db.mediaObject.findMany({
    where: {
      OR: [
        { kind: 'PHOTO', photoPost: null, createdAt: { lt: ago(24 * 3600_000) } },
        { kind: 'AVATAR', avatarOf: null, createdAt: { lt: ago(24 * 3600_000) } },
        { kind: 'CHAT_BLOB', createdAt: { lt: ago(MESSAGE_TTL_MS) } },
      ],
    },
    select: { id: true },
    take: 1000,
  });
  if (orphans.length) {
    await db.mediaObject.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    await unlinkMedia(orphans.map((o) => o.id));
  }

  await db.refreshToken.deleteMany({ where: { usedAt: { lt: ago(7 * 24 * 3600_000) } } });
  await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: ago(30 * 24 * 3600_000) } }] } });
  await db.emailToken.deleteMany({ where: { expiresAt: { lt: ago(24 * 3600_000) } } });
  await db.auditEvent.deleteMany({ where: { createdAt: { lt: ago(90 * 24 * 3600_000) } } });
}

export function startJobs() {
  const tick = () => runCleanup().catch((err) => logger.error({ err }, 'cleanup failed'));
  void tick();
  const t = setInterval(tick, 5 * 60_000);
  return () => clearInterval(t);
}
