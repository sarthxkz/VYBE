// Store-and-forward for Signal ciphertext. The server never sees plaintext and keeps nothing after delivery.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { canMessage } from '../../lib/authz.js';
import { conflict, forbidden, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { push } from '../../lib/push.js';
import { emit, isOnline } from '../../realtime.js';

const MAX_CIPHERTEXT = 64 * 1024;
/** Undelivered ciphertext is discarded after this long. */
export const MESSAGE_TTL_MS = 30 * 24 * 3600_000;

const wire = (m: { id: string; senderId: string; type: number; ciphertext: Uint8Array; createdAt: Date }) => ({
  id: m.id,
  senderId: m.senderId,
  type: m.type,
  body: Buffer.from(m.ciphertext).toString('base64'),
  createdAt: m.createdAt.toISOString(),
});

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

messagesRouter.post('/messages', rl.message, async (req, res) => {
  const body = parse(
    z.object({
      clientMsgId: z.uuid(),
      recipientId: z.uuid(),
      // The registration id the sender encrypted for; a mismatch means the recipient re-installed.
      recipientRegistrationId: z.number().int(),
      type: z.union([z.literal(2), z.literal(3)]),
      body: z
        .base64()
        .transform((s) => Buffer.from(s, 'base64'))
        .refine((b) => b.length > 0 && b.length <= MAX_CIPHERTEXT, 'ciphertext size'),
    }),
    req.body,
  );
  const me = uid(req);
  if (!(await canMessage(me, body.recipientId))) throw forbidden('CANNOT_MESSAGE');
  const device = await db.device.findUnique({ where: { userId: body.recipientId }, select: { registrationId: true } });
  if (!device || device.registrationId !== body.recipientRegistrationId) throw conflict('STALE_DEVICE', 'Recipient keys changed; fetch a new bundle');

  // Idempotent on (sender, clientMsgId): retries after a timeout do not duplicate.
  const existing = await db.encryptedMessage.findUnique({ where: { senderId_clientMsgId: { senderId: me, clientMsgId: body.clientMsgId } } });
  if (existing) {
    res.json({ id: existing.id, createdAt: existing.createdAt, duplicate: true });
    return;
  }
  const m = await db.encryptedMessage
    .create({ data: { senderId: me, recipientId: body.recipientId, clientMsgId: body.clientMsgId, type: body.type, ciphertext: body.body } })
    .catch(async (e) => {
      if (e?.code === 'P2002')
        return db.encryptedMessage.findUniqueOrThrow({ where: { senderId_clientMsgId: { senderId: me, clientMsgId: body.clientMsgId } } });
      throw e;
    });
  emit(body.recipientId, { type: 'message:new', data: wire(m) });
  if (!isOnline(body.recipientId)) void push(body.recipientId, 'messages', { type: 'message', url: `/chat/${me}` }, me);
  res.status(201).json({ id: m.id, createdAt: m.createdAt });
});

/** Everything waiting for me, oldest first. Senders I've since blocked or unfriended are already purged. */
messagesRouter.get('/messages/pending', async (req, res) => {
  const rows = await db.encryptedMessage.findMany({ where: { recipientId: uid(req) }, orderBy: { createdAt: 'asc' }, take: 500 });
  res.json({ messages: rows.map(wire), more: rows.length === 500 });
});

/** Recipient confirms it stored the decrypted messages locally; the server deletes the ciphertext. */
messagesRouter.post('/messages/ack', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.uuid()).min(1).max(500) }), req.body);
  const me = uid(req);
  const rows = await db.encryptedMessage.findMany({ where: { id: { in: ids }, recipientId: me }, select: { id: true, senderId: true, clientMsgId: true } });
  await db.encryptedMessage.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, recipientId: me } });
  for (const r of rows) emit(r.senderId, { type: 'message:delivered', data: { clientMsgId: r.clientMsgId, recipientId: me } });
  res.json({ acked: rows.length });
});
