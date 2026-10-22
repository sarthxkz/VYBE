import { readFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import { config } from '../../config.js';
import { db } from '../../lib/db.js';
import { requireAdmin, requireAuth } from '../../lib/auth.js';
import { mediaRoot } from '../../lib/media.js';
import { realtimeStats } from '../../realtime.js';
import { recentClientErrors } from '../telemetry/routes.js';

// Static panel files live in apps/server/admin (same relative path from src/ and dist/).
const here = path.dirname(fileURLToPath(import.meta.url));
const PANEL_DIR = path.resolve(here, '../../../admin');
const pkg = JSON.parse(readFileSync(path.resolve(here, '../../../package.json'), 'utf8')) as { version: string };
const startedAt = new Date();

/**
 * The web admin panel (HTML + JS only). It holds no secrets: it signs in through /v1/auth/login like the app,
 * and every number comes from /v1/admin/overview, which requires an ADMIN account.
 */
export const adminPanelRouter = Router();
adminPanelRouter.use('/admin', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
adminPanelRouter.use('/admin', express.static(PANEL_DIR, { index: 'index.html', dotfiles: 'deny', redirect: false }));

const day = 24 * 3600_000;
const since = (ms: number) => new Date(Date.now() - ms);

/** Aggregates only. No message content exists on the server, and no per-user data is returned here. */
export const adminStatsRouter = Router();
adminStatsRouter.use('/admin/overview', requireAuth, requireAdmin);

adminStatsRouter.get('/admin/overview', async (_req, res) => {
  const t0 = performance.now();
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10;

  const [
    users, verified, admins, suspended, new24h, new7d, active24h, active7d,
    sessions, friendships, pendingRequests, blocks,
    sharing, ghosts, photos, photos24h, stories, storyViews24h,
    pendingMessages, backups, openReports, actions7d, failedLogins24h,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { emailVerifiedAt: { not: null } } }),
    db.user.count({ where: { role: 'ADMIN' } }),
    db.user.count({ where: { suspendedAt: { not: null } } }),
    db.user.count({ where: { createdAt: { gt: since(day) } } }),
    db.user.count({ where: { createdAt: { gt: since(7 * day) } } }),
    db.user.count({ where: { lastActiveAt: { gt: since(day) } } }),
    db.user.count({ where: { lastActiveAt: { gt: since(7 * day) } } }),
    db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.friendship.count(),
    db.friendRequest.count(),
    db.block.count(),
    db.currentLocation.count(),
    db.locationSettings.count({ where: { ghost: true } }),
    db.photoPost.count(),
    db.photoPost.count({ where: { createdAt: { gt: since(day) } } }),
    db.story.count({ where: { expiresAt: { gt: new Date() } } }),
    db.storyView.count({ where: { viewedAt: { gt: since(day) } } }),
    db.encryptedMessage.count(),
    db.chatBackup.count(),
    db.report.count({ where: { status: 'OPEN' } }),
    db.moderationAction.count({ where: { createdAt: { gt: since(7 * day) } } }),
    db.auditEvent.count({ where: { type: 'auth.login_failed', createdAt: { gt: since(day) } } }),
  ]);

  const [media, mediaByKind, auditByType, signups, dbSize, migrations, disk] = await Promise.all([
    db.mediaObject.aggregate({ _sum: { size: true }, _count: true }),
    db.mediaObject.groupBy({ by: ['kind'], _sum: { size: true }, _count: true }),
    db.auditEvent.groupBy({ by: ['type'], where: { createdAt: { gt: since(day) } }, _count: true }),
    db.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*) AS n FROM users
      WHERE "createdAt" > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`.catch(() => [{ bytes: 0n }]),
    db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`.catch(() => []),
    statfs(mediaRoot).then((s) => ({ free: s.bavail * s.bsize, total: s.blocks * s.bsize })).catch(() => null),
  ]);

  // Fill missing days with zero so the chart has a bar per day.
  const perDay = new Map(signups.map((r) => [r.day.toISOString().slice(0, 10), Number(r.n)]));
  const signupsByDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * day).toISOString().slice(0, 10);
    return { day: d, count: perDay.get(d) ?? 0 };
  });

  const mem = process.memoryUsage();
  res.json({
    generatedAt: new Date().toISOString(),
    server: {
      version: pkg.version,
      node: process.version,
      env: config.NODE_ENV,
      startedAt: startedAt.toISOString(),
      uptimeSec: Math.round(process.uptime()),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      host: { platform: `${os.type()} ${os.release()}`, cpus: os.cpus().length, load: os.loadavg(), freeMem: os.freemem(), totalMem: os.totalmem(), uptimeSec: Math.round(os.uptime()) },
      push: !!config.FCM_SERVICE_ACCOUNT_PATH,
      mail: !!config.SMTP_URL,
      googleSignIn: config.GOOGLE_CLIENT_IDS.length > 0,
    },
    db: { ok: dbOk, latencyMs: dbLatencyMs, sizeBytes: Number(dbSize[0]?.bytes ?? 0), migrations: migrations.map((m) => ({ name: m.migration_name, finishedAt: m.finished_at })) },
    realtime: realtimeStats(),
    storage: {
      mediaFiles: media._count,
      mediaBytes: media._sum.size ?? 0,
      byKind: mediaByKind.map((k) => ({ kind: k.kind, files: k._count, bytes: k._sum.size ?? 0 })),
      disk,
    },
    users: { total: users, verified, admins, suspended, new24h, new7d, active24h, active7d, activeSessions: sessions, signupsByDay },
    social: { friendships, pendingRequests, blocks },
    location: { sharingNow: sharing, ghostMode: ghosts },
    content: { photos, photos24h, liveStories: stories, storyViews24h, pendingMessages, chatBackups: backups },
    moderation: { openReports, actions7d },
    security: { failedLogins24h, auditByType24h: auditByType.map((a) => ({ type: a.type, count: a._count })).sort((a, b) => b.count - a.count) },
    clientErrors: recentClientErrors.slice(0, 20),
  });
});

export const adminPanelEnabled = config.ADMIN_PANEL === 'on';
