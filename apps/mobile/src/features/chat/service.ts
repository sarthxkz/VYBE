import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import Signal, { type Bundle } from '@modules/vybe-signal';
import { api, API_URL, ApiError, tokens } from '@/api/client';
import { b64ToUtf8, utf8ToB64 } from '@/lib/bytes';
import { subscribe } from '@/lib/realtime';
import { insertMessage, kvGet, kvSet, markDeleted, setStatus, unsent, type ChatMessage } from './db';

/**
 * Wire payload, encrypted end-to-end with the Signal protocol. The server sees only ciphertext.
 * Control messages (receipts, deletes) are encrypted too, so the server cannot learn read state.
 */
export type Payload =
  | { v: 1; t: 'text'; id: string; ts: number; body: string; replyTo?: string }
  | { v: 1; t: 'image'; id: string; ts: number; image: { mediaId: string; key: string; w?: number; h?: number }; body?: string; replyTo?: string }
  | { v: 1; t: 'voice'; id: string; ts: number; voice: Voice; replyTo?: string }
  | { v: 1; t: 'read'; id: string; ts: number; ids: string[] }
  | { v: 1; t: 'delete'; id: string; ts: number; target: string };

/** A voice note: encrypted audio blob, its key, length, and a 0..1 loudness outline for the bubble. */
export type Voice = { mediaId: string; key: string; ms: number; wave: number[] };
export const VOICE_MAX_MS = 3 * 60_000;
export const VOICE_BARS = 40;

const PREKEY_BATCH = 50;
const PREKEY_LOW_WATER = 15;

/** Register this device's keys with the server (first sign-in on this install, or after a wipe). */
export async function ensureKeys(myUserId: string) {
  const status = await api<{ registered: boolean; registrationId?: number; ec: number; kyber: number }>('/keys/count');
  const local = await Signal.isRegistered();
  const sameDevice = local && status.registered && status.registrationId === (await Signal.registrationId());
  if (!sameDevice) {
    // New install or keys out of sync: a new identity. Friends will see "safety number changed".
    const reg = await Signal.createRegistration(myUserId, PREKEY_BATCH);
    await api('/keys/device', { method: 'PUT', body: reg });
    return;
  }
  if (status.ec < PREKEY_LOW_WATER || status.kyber < PREKEY_LOW_WATER) {
    await api('/keys/prekeys', { body: await Signal.generatePreKeys(PREKEY_BATCH) });
  }
  const lastRotation = Number((await kvGet('signedPreKeyRotatedAt')) ?? 0);
  if (Date.now() - lastRotation > 7 * 24 * 3600_000) {
    await api('/keys/prekeys', { body: { preKeys: [], kyberPreKeys: [], signedPreKey: await Signal.rotateSignedPreKey() } });
    await kvSet('signedPreKeyRotatedAt', String(Date.now()));
  }
}

async function startSession(peerId: string) {
  const bundle = await api<Bundle>(`/keys/bundle/${peerId}`);
  await Signal.resetSession(peerId);
  await Signal.processBundle(bundle);
  await kvSet(`reg:${peerId}`, String(bundle.registrationId));
}

async function deliver(peerId: string, payload: Payload) {
  const plaintext = utf8ToB64(JSON.stringify(payload));
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await Signal.hasSession(peerId)) || !(await kvGet(`reg:${peerId}`))) await startSession(peerId);
    const enc = await Signal.encrypt(peerId, plaintext);
    try {
      await api('/messages', {
        body: {
          clientMsgId: payload.id,
          recipientId: peerId,
          recipientRegistrationId: Number(await kvGet(`reg:${peerId}`)),
          type: enc.type,
          body: enc.body,
        },
      });
      return;
    } catch (e) {
      // Recipient reinstalled: start over with their new keys, once.
      if (e instanceof ApiError && e.code === 'STALE_DEVICE' && attempt === 0) {
        await Signal.resetSession(peerId);
        await kvSet(`reg:${peerId}`, '');
        continue;
      }
      throw e;
    }
  }
}

export async function sendText(peerId: string, body: string, replyTo?: string) {
  const id = Crypto.randomUUID();
  const msg: ChatMessage = { id, peerId, fromMe: 1, kind: 'text', body, replyTo: replyTo ?? null, image: null, status: 'sending', createdAt: Date.now(), deleted: 0 };
  await insertMessage(msg);
  await trySend(msg);
}

/** Encrypts a file on-device (AES-256-GCM) and uploads only the ciphertext. The key travels inside the Signal message. */
async function uploadSealed(peerId: string, uri: string, id: string) {
  const key = await Crypto.AESEncryptionKey.generate();
  const sealed = await Crypto.aesEncryptAsync(await new File(uri).bytes(), key);
  const tmp = new File(Paths.cache, `${id}.bin`);
  tmp.write(await sealed.combined());
  const form = new FormData();
  form.append('kind', 'CHAT_BLOB');
  form.append('audienceUserId', peerId);
  form.append('file', { uri: tmp.uri, name: 'blob.bin', type: 'application/octet-stream' } as unknown as Blob);
  try {
    const { id: mediaId } = await api<{ id: string }>('/media', { form });
    return { mediaId, key: await key.encoded('base64') };
  } finally {
    tmp.delete();
  }
}

export async function sendImage(peerId: string, uri: string, w?: number, h?: number) {
  const id = Crypto.randomUUID();
  const image = { ...(await uploadSealed(peerId, uri, id)), w, h };
  const msg: ChatMessage = { id, peerId, fromMe: 1, kind: 'image', body: null, replyTo: null, image: JSON.stringify(image), status: 'sending', createdAt: Date.now(), deleted: 0 };
  await insertMessage(msg);
  await trySend(msg);
}

/** Sends a recorded voice note. The local recording is deleted once its ciphertext is uploaded. */
export async function sendVoice(peerId: string, uri: string, ms: number, wave: number[]) {
  const id = Crypto.randomUUID();
  const voice: Voice = { ...(await uploadSealed(peerId, uri, id)), ms: Math.round(ms), wave: wave.slice(0, VOICE_BARS).map((x) => Math.round(x * 100) / 100) };
  new File(uri).delete();
  const msg: ChatMessage = { id, peerId, fromMe: 1, kind: 'voice', body: null, replyTo: null, image: JSON.stringify(voice), status: 'sending', createdAt: Date.now(), deleted: 0 };
  await insertMessage(msg);
  await trySend(msg);
}

async function trySend(m: ChatMessage) {
  const payload: Payload =
    m.kind === 'image'
      ? { v: 1, t: 'image', id: m.id, ts: m.createdAt, image: JSON.parse(m.image!), replyTo: m.replyTo ?? undefined }
      : m.kind === 'voice'
        ? { v: 1, t: 'voice', id: m.id, ts: m.createdAt, voice: JSON.parse(m.image!), replyTo: m.replyTo ?? undefined }
        : { v: 1, t: 'text', id: m.id, ts: m.createdAt, body: m.body ?? '', replyTo: m.replyTo ?? undefined };
  try {
    await deliver(m.peerId, payload);
    await setStatus(m.id, 'sent');
  } catch {
    await setStatus(m.id, 'failed');
  }
}

/** Retries anything that never reached the server (offline, app killed mid-send). */
export async function retryUnsent() {
  for (const m of await unsent()) await trySend(m);
}

export async function sendReadReceipts(peerId: string, ids: string[]) {
  if (!ids.length) return;
  if ((await kvGet('setting:readReceipts')) === 'off') return;
  await deliver(peerId, { v: 1, t: 'read', id: Crypto.randomUUID(), ts: Date.now(), ids }).catch(() => {});
}

export async function deleteForEveryone(peerId: string, target: string) {
  await markDeleted(target, peerId, 1);
  await deliver(peerId, { v: 1, t: 'delete', id: Crypto.randomUUID(), ts: Date.now(), target }).catch(() => {});
}

/** Downloads and decrypts a chat attachment into the cache; returns a local file uri. */
async function openSealed(blob: { mediaId: string; key: string }, name: string) {
  const out = new File(Paths.cache, name);
  if (out.exists) return out.uri;
  const res = await fetch(`${API_URL}/v1/media/${blob.mediaId}`, { headers: { Authorization: `Bearer ${tokens.access}` } });
  if (!res.ok) throw new Error('download failed');
  const key = await Crypto.AESEncryptionKey.import(blob.key, 'base64');
  const plain = await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(new Uint8Array(await res.arrayBuffer())), key);
  out.write(plain);
  return out.uri;
}

export const openImage = (image: { mediaId: string; key: string }) => openSealed(image, `img-${image.mediaId}.jpg`);
export const openVoice = (voice: { mediaId: string; key: string }) => openSealed(voice, `voice-${voice.mediaId}.m4a`);

type Wire = { id: string; senderId: string; type: number; body: string; createdAt: string };

async function handleIncoming(m: Wire) {
  let payload: Payload;
  try {
    payload = JSON.parse(b64ToUtf8(await Signal.decrypt(m.senderId, m.type, m.body))) as Payload;
  } catch (e) {
    if ((e as { code?: string }).code === 'DUPLICATE') return; // already processed before a lost ack
    await insertMessage({
      id: `sys-${m.id}`, peerId: m.senderId, fromMe: 0, kind: 'system', body: "A message couldn't be decrypted.",
      replyTo: null, image: null, status: 'received', createdAt: Date.parse(m.createdAt), deleted: 0,
    });
    return;
  }
  const base = { peerId: m.senderId, fromMe: 0, replyTo: null, image: null, status: 'received' as const, createdAt: Date.parse(m.createdAt), deleted: 0 };
  switch (payload.t) {
    case 'text':
      await insertMessage({ ...base, id: payload.id, kind: 'text', body: payload.body.slice(0, 10_000), replyTo: payload.replyTo ?? null });
      break;
    case 'image':
      await insertMessage({ ...base, id: payload.id, kind: 'image', body: payload.body ?? null, image: JSON.stringify(payload.image) });
      break;
    case 'voice': {
      // Re-shape rather than store what the sender sent: bounded length and values.
      const { mediaId, key, ms, wave } = payload.voice;
      const voice: Voice = { mediaId: String(mediaId), key: String(key), ms: Math.min(Math.max(0, Number(ms) || 0), VOICE_MAX_MS), wave: (Array.isArray(wave) ? wave : []).slice(0, VOICE_BARS).map((x) => Math.min(1, Math.max(0, Number(x) || 0))) };
      await insertMessage({ ...base, id: payload.id, kind: 'voice', body: null, image: JSON.stringify(voice), replyTo: payload.replyTo ?? null });
      break;
    }
    case 'read':
      for (const id of payload.ids.slice(0, 500)) await setStatus(id, 'read', m.senderId);
      break;
    case 'delete':
      await markDeleted(payload.target, m.senderId, 0);
      break;
  }
}

let syncing: Promise<void> | null = null;

/** Pull everything waiting on the server, decrypt, store locally, then ack (server deletes the ciphertext). */
export function syncInbox() {
  syncing ??= (async () => {
    try {
      for (;;) {
        const { messages, more } = await api<{ messages: Wire[]; more: boolean }>('/messages/pending');
        if (!messages.length) break;
        for (const m of messages) await handleIncoming(m);
        await api('/messages/ack', { body: { ids: messages.map((m) => m.id) } });
        if (!more) break;
      }
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export function startChatRealtime() {
  return subscribe((ev) => {
    if (ev.type === 'message:new') void syncInbox().catch(() => {});
    if (ev.type === 'message:delivered') void setStatus(String(ev.data.clientMsgId), 'delivered');
    if (ev.type === 'keys:changed') void Signal.resetSession(String(ev.data.userId)).then(() => kvSet(`reg:${ev.data.userId}`, ''));
    if (ev.type === 'hello') void syncInbox().then(retryUnsent).catch(() => {});
  });
}
