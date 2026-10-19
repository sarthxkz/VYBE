import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import sharp, { type OutputInfo } from 'sharp';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { areFriends, canViewMedia } from '../../lib/authz.js';
import { badRequest, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { mediaPath, writeMedia } from '../../lib/media.js';

const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_BLOB = 16 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BLOB, files: 1, fields: 5 } });

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

/**
 * kind=PHOTO|AVATAR: real image content is required. It is decoded and re-encoded to JPEG,
 * which drops EXIF (including GPS) and any embedded payloads.
 * kind=CHAT_BLOB: opaque client-side-encrypted bytes for one friend; stored as-is.
 */
mediaRouter.post('/media', rl.upload, upload.single('file'), async (req, res) => {
  const body = parse(
    z.object({ kind: z.enum(['PHOTO', 'AVATAR', 'CHAT_BLOB']), audienceUserId: z.uuid().optional() }),
    req.body,
  );
  const file = req.file;
  if (!file?.buffer.length) throw badRequest('FILE_REQUIRED');
  const me = uid(req);
  const id = randomUUID();

  if (body.kind === 'CHAT_BLOB') {
    if (!body.audienceUserId || !(await areFriends(me, body.audienceUserId))) throw badRequest('INVALID_AUDIENCE');
    await writeMedia(id, file.buffer);
    await db.mediaObject.create({
      data: { id, ownerId: me, kind: 'CHAT_BLOB', mime: 'application/octet-stream', size: file.size, audienceUserId: body.audienceUserId },
    });
    res.status(201).json({ id });
    return;
  }

  if (file.size > MAX_IMAGE) throw badRequest('FILE_TOO_LARGE');
  let out: { data: Buffer; info: OutputInfo };
  try {
    const img = sharp(file.buffer, { failOn: 'error', limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    if (!['jpeg', 'png', 'webp', 'heif'].includes(meta.format ?? '')) throw new Error('format');
    const max = body.kind === 'AVATAR' ? 512 : 2048;
    out = await img
      .rotate() // apply EXIF orientation before metadata is dropped
      .resize(max, max, { fit: body.kind === 'AVATAR' ? 'cover' : 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw badRequest('INVALID_IMAGE');
  }
  await writeMedia(id, out.data);
  await db.mediaObject.create({
    data: { id, ownerId: me, kind: body.kind, mime: 'image/jpeg', size: out.data.length, width: out.info.width, height: out.info.height },
  });
  res.status(201).json({ id, width: out.info.width, height: out.info.height });
});

/** Authenticated, authorization-checked delivery. 404 (not 403) so ids cannot be probed. */
mediaRouter.get('/media/:id', async (req, res) => {
  const id = parse(z.uuid(), req.params.id);
  if (!(await canViewMedia(id, uid(req)))) throw notFound();
  const m = await db.mediaObject.findUniqueOrThrow({ where: { id }, select: { mime: true, size: true } });
  res.set({
    'Content-Type': m.mime,
    'Content-Length': String(m.size),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  createReadStream(mediaPath(id))
    .on('error', () => (res.headersSent ? res.destroy() : res.status(404).end()))
    .pipe(res);
});
