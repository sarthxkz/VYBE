import express, { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';

// Encrypted chat backup: one opaque blob per user, sealed on the phone with a key derived from the user's
// backup password (PBKDF2 600k, in the app). The server never sees the password or the key.
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;

export const backupRouter = Router();
backupRouter.use(requireAuth);

backupRouter.get('/backup', async (req, res) => {
  const b = await db.chatBackup.findUnique({ where: { userId: uid(req) }, select: { salt: true, size: true, updatedAt: true } });
  res.json(b ? { exists: true, ...b } : { exists: false });
});

backupRouter.get('/backup/data', async (req, res) => {
  const b = await db.chatBackup.findUnique({ where: { userId: uid(req) }, select: { data: true } });
  if (!b) throw notFound();
  res.type('application/octet-stream').set('Cache-Control', 'no-store').send(Buffer.from(b.data));
});

backupRouter.put(
  '/backup',
  rl.backup,
  express.raw({ type: 'application/octet-stream', limit: BACKUP_MAX_BYTES }),
  async (req, res) => {
    // Salt is public (needed on a new phone to re-derive the key); 16 random bytes, base64.
    const salt = parse(z.string().regex(/^[A-Za-z0-9+/]{22}==$/), req.query.salt);
    const data = parse(z.instanceof(Buffer).refine((b) => b.length > 28, 'empty backup'), req.body);
    const me = uid(req);
    const bytes = new Uint8Array(data); // Prisma Bytes wants an ArrayBuffer-backed copy
    const b = await db.chatBackup.upsert({
      where: { userId: me },
      create: { userId: me, salt, data: bytes, size: bytes.length },
      update: { salt, data: bytes, size: bytes.length },
      select: { size: true, updatedAt: true },
    });
    res.json(b);
  },
);

backupRouter.delete('/backup', async (req, res) => {
  await db.chatBackup.deleteMany({ where: { userId: uid(req) } });
  res.json({ ok: true });
});
