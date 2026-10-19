import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAdmin, requireAuth, revokeAllSessions, uid } from '../../lib/auth.js';
import { canViewPhoto } from '../../lib/authz.js';
import { badRequest, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { audit } from '../../lib/audit.js';
import { deleteMedia } from '../../lib/media.js';
import { disconnect } from '../../realtime.js';

export const REPORT_REASONS = ['spam', 'harassment', 'nudity', 'violence', 'impersonation', 'self_harm', 'other'] as const;

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.post('/reports', rl.report, async (req, res) => {
  const body = parse(
    z.object({
      targetUserId: z.uuid(),
      photoPostId: z.uuid().optional(),
      reason: z.enum(REPORT_REASONS),
      details: z.string().trim().max(1000).optional(),
    }),
    req.body,
  );
  const me = uid(req);
  if (body.targetUserId === me) throw badRequest('CANNOT_REPORT_SELF');
  if (!(await db.user.findUnique({ where: { id: body.targetUserId }, select: { id: true } }))) throw notFound();
  if (body.photoPostId) {
    // You can only report a photo you were able to see, and it must be the target's.
    const post = await db.photoPost.findUnique({ where: { id: body.photoPostId }, select: { senderId: true } });
    if (!post || post.senderId !== body.targetUserId || !(await canViewPhoto(body.photoPostId, me))) throw notFound();
  }
  const r = await db.report.create({ data: { reporterId: me, ...body } });
  res.status(201).json({ id: r.id });
});

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/admin/reports', async (req, res) => {
  const status = parse(z.enum(['OPEN', 'RESOLVED']).default('OPEN'), req.query.status);
  res.json({
    reports: await db.report.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { target: { select: { id: true, username: true, suspendedAt: true } }, photoPost: { select: { id: true, caption: true, mediaId: true } } },
    }),
  });
});

adminRouter.post('/admin/reports/:id/resolve', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  const body = parse(z.object({ action: z.enum(['NONE', 'REMOVE_PHOTO', 'SUSPEND']), note: z.string().max(1000).optional() }), req.body);
  const report = await db.report.findUnique({ where: { id }, include: { photoPost: { select: { mediaId: true } } } });
  if (!report) throw notFound();
  if (body.action === 'REMOVE_PHOTO' && report.photoPost) await deleteMedia([report.photoPost.mediaId]);
  if (body.action === 'SUSPEND') {
    await db.user.update({ where: { id: report.targetUserId }, data: { suspendedAt: new Date() } });
    await revokeAllSessions(report.targetUserId);
    disconnect(report.targetUserId);
  }
  await db.$transaction([
    db.moderationAction.create({ data: { reportId: id, targetUserId: report.targetUserId, actorId: uid(req), action: body.action, note: body.note } }),
    db.report.update({ where: { id }, data: { status: 'RESOLVED' } }),
  ]);
  audit('admin.report_resolved', uid(req), req, { action: body.action });
  res.json({ ok: true });
});
