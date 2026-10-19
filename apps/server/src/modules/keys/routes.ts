// Public-key directory for the Signal protocol. Only PUBLIC keys and signatures ever reach the server.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { canMessage, friendIds } from '../../lib/authz.js';
import { notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';
import { audit } from '../../lib/audit.js';
import { emitMany } from '../../realtime.js';

const b64 = (max: number) =>
  z
    .base64()
    .transform((s) => Buffer.from(s, 'base64'))
    .refine((b) => b.length > 0 && b.length <= max, 'bad key length');
const keyId = z.number().int().min(0).max(0xffffff);
const signed = z.object({ id: keyId, publicKey: b64(2048), signature: b64(128) });
const preKeys = z.array(z.object({ id: keyId, publicKey: b64(64) })).max(200);
const kyberPreKeys = z.array(signed).max(200);

const toOneTime = (deviceId: string, ec: z.infer<typeof preKeys>, kyber: z.infer<typeof kyberPreKeys>) => [
  ...ec.map((k) => ({ deviceId, kind: 'EC' as const, keyId: k.id, publicKey: k.publicKey })),
  ...kyber.map((k) => ({ deviceId, kind: 'KYBER' as const, keyId: k.id, publicKey: k.publicKey, signature: k.signature })),
];

export const keysRouter = Router();
keysRouter.use(requireAuth);

/**
 * Register (or replace) this account's E2EE device. Replacing it means a new identity:
 * pending ciphertext for the old identity is undecryptable and dropped, and friends are told to re-verify.
 */
keysRouter.put('/keys/device', async (req, res) => {
  const body = parse(
    z.object({
      registrationId: z.number().int().min(1).max(16380),
      identityKey: b64(64),
      signedPreKey: signed,
      kyberPreKey: signed,
      preKeys,
      kyberPreKeys,
    }),
    req.body,
  );
  const me = uid(req);
  const prev = await db.device.findUnique({ where: { userId: me } });
  const identityChanged = !!prev && !Buffer.from(prev.identityKey).equals(body.identityKey);
  const data = {
    registrationId: body.registrationId,
    identityKey: body.identityKey,
    signedPreKeyId: body.signedPreKey.id,
    signedPreKey: body.signedPreKey.publicKey,
    signedPreKeySignature: body.signedPreKey.signature,
    kyberPreKeyId: body.kyberPreKey.id,
    kyberPreKey: body.kyberPreKey.publicKey,
    kyberPreKeySignature: body.kyberPreKey.signature,
  };
  await db.$transaction(async (tx) => {
    const d = await tx.device.upsert({ where: { userId: me }, create: { userId: me, ...data }, update: data });
    await tx.oneTimePreKey.deleteMany({ where: { deviceId: d.id } });
    await tx.oneTimePreKey.createMany({ data: toOneTime(d.id, body.preKeys, body.kyberPreKeys) });
    if (identityChanged) await tx.encryptedMessage.deleteMany({ where: { recipientId: me } });
  });
  if (identityChanged || !prev) {
    audit(prev ? 'keys.identity_changed' : 'keys.registered', me, req);
    emitMany(await friendIds(me), { type: 'keys:changed', data: { userId: me } });
  }
  res.json({ ok: true });
});

keysRouter.post('/keys/prekeys', async (req, res) => {
  const body = parse(z.object({ preKeys, kyberPreKeys, signedPreKey: signed.optional() }), req.body);
  const d = await db.device.findUnique({ where: { userId: uid(req) } });
  if (!d) throw notFound('NO_DEVICE');
  await db.$transaction([
    db.oneTimePreKey.createMany({ data: toOneTime(d.id, body.preKeys, body.kyberPreKeys), skipDuplicates: true }),
    ...(body.signedPreKey
      ? [
          db.device.update({
            where: { id: d.id },
            data: { signedPreKeyId: body.signedPreKey.id, signedPreKey: body.signedPreKey.publicKey, signedPreKeySignature: body.signedPreKey.signature },
          }),
        ]
      : []),
  ]);
  res.json({ ok: true });
});

keysRouter.get('/keys/count', async (req, res) => {
  const d = await db.device.findUnique({ where: { userId: uid(req) }, select: { id: true, registrationId: true } });
  if (!d) {
    res.json({ registered: false, ec: 0, kyber: 0 });
    return;
  }
  const [ec, kyber] = await Promise.all([
    db.oneTimePreKey.count({ where: { deviceId: d.id, kind: 'EC' } }),
    db.oneTimePreKey.count({ where: { deviceId: d.id, kind: 'KYBER' } }),
  ]);
  res.json({ registered: true, registrationId: d.registrationId, ec, kyber });
});

type Claimed = { keyId: number; publicKey: Uint8Array; signature: Uint8Array | null };

/** Takes and deletes one one-time key; SKIP LOCKED means concurrent fetchers never get the same key. */
const claim = async (deviceId: string, kind: 'EC' | 'KYBER') =>
  (
    await db.$queryRaw<Claimed[]>`
      DELETE FROM one_time_prekeys WHERE id = (
        SELECT id FROM one_time_prekeys WHERE "deviceId" = ${deviceId}::uuid AND kind = ${kind}::"PreKeyKind"
        ORDER BY "keyId" LIMIT 1 FOR UPDATE SKIP LOCKED
      ) RETURNING "keyId", "publicKey", signature`
  )[0];

/** A friend's prekey bundle for starting a session. Friends only, not blocked. */
keysRouter.get('/keys/bundle/:userId', rl.keyBundle, async (req, res) => {
  const other = parse(z.uuid(), req.params.userId);
  if (!(await canMessage(uid(req), other))) throw notFound();
  const d = await db.device.findUnique({ where: { userId: other } });
  if (!d) throw notFound('NO_DEVICE');
  const [ec, kyber] = [await claim(d.id, 'EC'), await claim(d.id, 'KYBER')];
  const s = (b: Uint8Array) => Buffer.from(b).toString('base64');
  res.json({
    userId: other,
    deviceId: 1,
    registrationId: d.registrationId,
    identityKey: s(d.identityKey),
    signedPreKey: { id: d.signedPreKeyId, publicKey: s(d.signedPreKey), signature: s(d.signedPreKeySignature) },
    // Falls back to the last-resort Kyber key when one-time Kyber keys run out.
    kyberPreKey: kyber
      ? { id: kyber.keyId, publicKey: s(kyber.publicKey), signature: s(kyber.signature!) }
      : { id: d.kyberPreKeyId, publicKey: s(d.kyberPreKey), signature: s(d.kyberPreKeySignature) },
    preKey: ec ? { id: ec.keyId, publicKey: s(ec.publicKey) } : null,
  });
});

/** Identity key only, for safety-number verification. */
keysRouter.get('/keys/identity/:userId', async (req, res) => {
  const other = parse(z.uuid(), req.params.userId);
  if (!(await canMessage(uid(req), other))) throw notFound();
  const d = await db.device.findUnique({ where: { userId: other }, select: { identityKey: true, registrationId: true } });
  if (!d) throw notFound('NO_DEVICE');
  res.json({ identityKey: Buffer.from(d.identityKey).toString('base64'), registrationId: d.registrationId });
});
