import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { reportError, step } from '@/lib/report';
import { alertMessage } from '@/features/alerts';
import Signal, { type Bundle } from '@modules/vybe-signal';
import { api, API_URL, ApiError, tokens } from '@/api/client';
import { b64ToUtf8, utf8ToB64 } from '@/lib/bytes';
import { subscribe } from '@/lib/realtime';
import { queryClient } from '@/lib/query';
import type { Friend } from '@/api/types';
import { themeById } from './look';
import { insertMessage, kvGet, kvSet, markDeleted, setReaction, setStatus, unsent, type ChatMessage } from './db';

/**
 * Wire payload, encrypted end-to-end with the Signal protocol. The server sees only ciphertext.
 * Control messages (receipts, deletes) are encrypted too, so the server cannot learn read state.
 */
export type Payload =
  | { v: 1; t: 'text'; id: string; ts: number; body: string; replyTo?: string }
  | { v: 1; t: 'image'; id: string; ts: number; image: { mediaId: string; key: string; w?: number; h?: number }; body?: string; replyTo?: string }
  | { v: 1; t: 'read'; id: string; ts: number; ids: string[] }
  | { v: 1; t: 'delete'; id: string; ts: number; target: string }
  | { v: 1; t: 'gif'; id: string; ts: number; gif: { gifId: string; w: number; h: number }; replyTo?: string }
  | { v: 1; t: 'sticker'; id: string; ts: number; sticker: string; replyTo?: string }
  | { v: 1; t: 'react'; id: string; ts: number; target: string; emoji: string | null }
  | { v: 1; t: 'theme'; id: string; ts: number; theme: string | null };

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
  const bundle = await step('fetchBundle', () => api<Bundle>(`/keys/bundle/${peerId}`));
  await Signal.resetSession(peerId);
  await step('processBundle', () => Signal.processBundle(bundle));
  await kvSet(`reg:${peerId}`, String(bundle.registrationId));
}

async function deliver(peerId: string, payload: Payload) {
  const plaintext = utf8ToB64(JSON.stringify(payload));
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await Signal.hasSession(peerId)) || !(await kvGet(`reg:${peerId}`))) await startSession(peerId);
    const enc = await step('encrypt', () => Signal.encrypt(peerId, plaintext));
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

async function sendKind(peerId: string, kind: 'gif' | 'sticker', fields: Pick<ChatMessage, 'body' | 'image'>, replyTo?: string) {
  const msg: ChatMessage = { id: Crypto.randomUUID(), peerId, fromMe: 1, kind, ...fields, replyTo: replyTo ?? null, status: 'sending', createdAt: Date.now(), deleted: 0 };
  await insertMessage(msg);
  await trySend(msg);
}
export const sendGif = (peerId: string, gif: { gifId: string; w: number; h: number }, replyTo?: string) => sendKind(peerId, 'gif', { body: null, image: JSON.stringify(gif) }, replyTo);
export const sendSticker = (peerId: string, sticker: string, replyTo?: string) => sendKind(peerId, 'sticker', { body: sticker, image: null }, replyTo);

/** React to a message (or clear with null). Encrypted like everything else; the server can't see reactions. */
export async function sendReaction(peerId: string, target: string, emoji: string | null) {
  await setReaction(target, peerId, 'mine', emoji);
  await deliver(peerId, { v: 1, t: 'react', id: Crypto.randomUUID(), ts: Date.now(), target, emoji }).catch((e) => reportError('chat-react', e));
}

/** Per-chat theme, shared with the other person like Instagram (encrypted; null = default). */
export const chatTheme = async (peerId: string) => themeById(await kvGet(`theme:${peerId}`));

async function applyTheme(peerId: string, id: string, theme: string | null, who: string, ts: number) {
  await kvSet(`theme:${peerId}`, theme ?? '');
  const body = `${who} changed the theme to ${themeById(theme)?.name ?? 'Default'}`;
  await insertMessage({ id, peerId, fromMe: 0, kind: 'system', body, replyTo: null, image: null, status: 'received', createdAt: ts, deleted: 0 });
}

export async function sendTheme(peerId: string, theme: string | null) {
  const id = Crypto.randomUUID();
  await applyTheme(peerId, `theme-${id}`, theme, 'You', Date.now());
  await deliver(peerId, { v: 1, t: 'theme', id, ts: Date.now(), theme }).catch((e) => reportError('chat-theme', e));
}

export async function sendText(peerId: string, body: string, replyTo?: string) {
  const id = Crypto.randomUUID();
  const msg: ChatMessage = { id, peerId, fromMe: 1, kind: 'text', body, replyTo: replyTo ?? null, image: null, status: 'sending', createdAt: Date.now(), deleted: 0 };
  await insertMessage(msg);
  await trySend(msg);
}

/** Encrypts the image on-device (AES-256-GCM), uploads only ciphertext, and sends the key inside the Signal message. */
export async function sendImage(peerId: string, uri: string, w?: number, h?: number) {
  const id = Crypto.randomUUID();
  const key = await Crypto.AESEncryptionKey.generate();
  const sealed = await Crypto.aesEncryptAsync(await new File(uri).bytes(), key);
  const tmp = new File(Paths.cache, `${id}.bin`);
  tmp.write(await sealed.combined());
  const form = new FormData();
  form.append('kind', 'CHAT_BLOB');
  form.append('audienceUserId', peerId);
  form.append('file', { uri: tmp.uri, name: 'blob.bin', type: 'application/octet-stream' } as unknown as Blob);
  const { id: mediaId } = await api<{ id: string }>('/media', { form });
  tmp.delete();
  const image = { mediaId, key: await key.encoded('base64'), w, h };
  const msg: ChatMessage = { id, peerId, fromMe: 1, kind: 'image', body: null, replyTo: null, image: JSON.stringify(image), status: 'sending', createdAt: Date.now(), deleted: 0 };
  await insertMessage(msg);
  await trySend(msg);
}

async function trySend(m: ChatMessage) {
  const replyTo = m.replyTo ?? undefined;
  const payload: Payload =
    m.kind === 'image'
      ? { v: 1, t: 'image', id: m.id, ts: m.createdAt, image: JSON.parse(m.image!), replyTo }
      : m.kind === 'gif'
        ? { v: 1, t: 'gif', id: m.id, ts: m.createdAt, gif: JSON.parse(m.image!), replyTo }
        : m.kind === 'sticker'
          ? { v: 1, t: 'sticker', id: m.id, ts: m.createdAt, sticker: m.body ?? '', replyTo }
          : { v: 1, t: 'text', id: m.id, ts: m.createdAt, body: m.body ?? '', replyTo };
  try {
    await deliver(m.peerId, payload);
    await setStatus(m.id, 'sent');
  } catch (e) {
    reportError('chat-send', e);
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

/** Downloads and decrypts a chat image into the cache; returns a local file uri. */
export async function openImage(image: { mediaId: string; key: string }) {
  const out = new File(Paths.cache, `img-${image.mediaId}.jpg`);
  if (out.exists) return out.uri;
  const res = await fetch(`${API_URL}/v1/media/${image.mediaId}`, { headers: { Authorization: `Bearer ${tokens.access}` } });
  if (!res.ok) throw new Error('download failed');
  const key = await Crypto.AESEncryptionKey.import(image.key, 'base64');
  const plain = await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(new Uint8Array(await res.arrayBuffer())), key);
  out.write(plain);
  return out.uri;
}

type Wire = { id: string; senderId: string; type: number; body: string; createdAt: string };

async function handleIncoming(m: Wire) {
  let payload: Payload;
  try {
    payload = JSON.parse(b64ToUtf8(await Signal.decrypt(m.senderId, m.type, m.body))) as Payload;
  } catch (e) {
    if ((e as { code?: string }).code === 'DUPLICATE') return; // already processed before a lost ack
    reportError('chat-decrypt', e);
    await insertMessage({
      id: `sys-${m.id}`, peerId: m.senderId, fromMe: 0, kind: 'system', body: "A message couldn't be decrypted.",
      replyTo: null, image: null, status: 'received', createdAt: Date.parse(m.createdAt), deleted: 0,
    });
    return;
  }
  // Alert for fresh messages only, so opening the app after a long time doesn't fire a burst of old ones.
  const fresh = Date.now() - Date.parse(m.createdAt) < 30 * 60_000;
  if (fresh && (payload.t === 'text' || payload.t === 'image' || payload.t === 'gif' || payload.t === 'sticker'))
    void alertMessage(m.senderId, payload.t, payload.t === 'text' ? payload.body : null);
  const base = { peerId: m.senderId, fromMe: 0, replyTo: null, image: null, status: 'received' as const, createdAt: Date.parse(m.createdAt), deleted: 0 };
  switch (payload.t) {
    case 'text':
      await insertMessage({ ...base, id: payload.id, kind: 'text', body: payload.body.slice(0, 10_000), replyTo: payload.replyTo ?? null });
      break;
    case 'image':
      await insertMessage({ ...base, id: payload.id, kind: 'image', body: payload.body ?? null, image: JSON.stringify(payload.image) });
      break;
    case 'read':
      for (const id of payload.ids.slice(0, 500)) await setStatus(id, 'read', m.senderId);
      break;
    case 'delete':
      await markDeleted(payload.target, m.senderId, 0);
      break;
    case 'gif':
      if (/^[A-Za-z0-9]{4,40}$/.test(payload.gif?.gifId ?? ''))
        await insertMessage({ ...base, id: payload.id, kind: 'gif', body: null, image: JSON.stringify({ gifId: payload.gif.gifId, w: Number(payload.gif.w) || 200, h: Number(payload.gif.h) || 200 }), replyTo: payload.replyTo ?? null });
      break;
    case 'sticker':
      await insertMessage({ ...base, id: payload.id, kind: 'sticker', body: String(payload.sticker).slice(0, 40), replyTo: payload.replyTo ?? null });
      break;
    case 'react':
      await setReaction(payload.target, m.senderId, 'theirs', payload.emoji ? String(payload.emoji).slice(0, 16) : null);
      break;
    case 'theme': {
      const f = queryClient.getQueryData<{ friends: Friend[] }>(['friends'])?.friends.find((x) => x.id === m.senderId);
      const theme = themeById(payload.theme)?.id ?? null; // ignore ids this version doesn't know
      await applyTheme(m.senderId, `theme-${payload.id}`, theme, f?.displayName ?? f?.username ?? 'They', Date.parse(m.createdAt));
      break;
    }
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
