import { fetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Signal from '@modules/vybe-signal';
import { api, API_URL, tokens } from '@/api/client';
import { bytesToB64 } from '@/lib/bytes';
import { allMessages, importMessages, type ChatMessage } from './db';

// Encrypted chat backup. The phone derives a key from the user's backup password (PBKDF2-SHA256, 600k,
// native), seals the whole history with AES-256-GCM, and uploads only ciphertext + the public salt.
// Forgetting the password means the backup can't be opened by anyone, including us.
const STORE = 'vybe.backup'; // { salt, key, at } in Keystore-backed SecureStore
const MIN_GAP_MS = 30 * 60_000;
export const MIN_PASSWORD = 8;
export const RESTORE_SKIPPED = 'vybe.backup.restoreSkipped';

type Local = { salt: string; key: string; at: number };
export type BackupInfo = { exists: false } | { exists: true; salt: string; size: number; updatedAt: string };

const readLocal = async (): Promise<Local | null> => JSON.parse((await SecureStore.getItemAsync(STORE)) ?? 'null') as Local | null;
const writeLocal = (l: Local) => SecureStore.setItemAsync(STORE, JSON.stringify(l), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });

export const backupInfo = () => api<BackupInfo>('/backup');
export const backupEnabledHere = async () => !!(await readLocal());

async function authed(path: string, init: { method?: string; body?: Uint8Array<ArrayBuffer> } = {}) {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${tokens.access}`, ...(init.body && { 'Content-Type': 'application/octet-stream' }) },
    body: init.body,
  });
  if (!res.ok) throw new Error(`backup ${res.status}`);
  return res;
}

/** Turn backup on (or change the password): new salt and key, then back up immediately. */
export async function enableBackup(password: string) {
  if (password.length < MIN_PASSWORD) throw new Error('PASSWORD_TOO_SHORT');
  const salt = bytesToB64(Crypto.getRandomBytes(16));
  const key = await Signal.deriveBackupKey(password, salt);
  await writeLocal({ salt, key, at: 0 });
  await backupNow();
}

export async function backupNow() {
  const local = await readLocal();
  if (!local) return null;
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, exportedAt: Date.now(), messages: await allMessages() }));
  const key = await Crypto.AESEncryptionKey.import(local.key, 'base64');
  const sealed = await Crypto.aesEncryptAsync(plain, key);
  await authed(`/backup?salt=${encodeURIComponent(local.salt)}`, { method: 'PUT', body: new Uint8Array(await sealed.combined()) });
  await writeLocal({ ...local, at: Date.now() });
  return Date.now();
}

/** Called when the app goes to the background; cheap no-op unless backup is on and it has been a while. */
export async function maybeBackup() {
  const local = await readLocal().catch(() => null);
  if (local && Date.now() - local.at > MIN_GAP_MS) await backupNow().catch(() => {});
}

/** New phone / fresh login: download, decrypt with the password, merge into local history. */
export async function restoreBackup(password: string) {
  const info = await backupInfo();
  if (!info.exists) throw new Error('NO_BACKUP');
  const keyB64 = await Signal.deriveBackupKey(password, info.salt);
  const blob = new Uint8Array(await (await authed('/backup/data')).arrayBuffer());
  let json: string;
  try {
    const key = await Crypto.AESEncryptionKey.import(keyB64, 'base64');
    json = new TextDecoder().decode(await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(blob), key));
  } catch {
    throw new Error('WRONG_PASSWORD'); // GCM authentication fails for any other key
  }
  const data = JSON.parse(json) as { v: number; messages: ChatMessage[] };
  await importMessages(data.messages);
  // Keep backing up from this phone with the same password.
  await writeLocal({ salt: info.salt, key: keyB64, at: Date.now() });
  return data.messages.length;
}

/** Turn off: forget the key here and delete the server copy. */
export async function disableBackup() {
  await SecureStore.deleteItemAsync(STORE);
  await api('/backup', { method: 'DELETE' });
}

/** Sign-out: forget the key on this phone; the server copy stays for the next login. */
export async function forgetBackupKey() {
  await SecureStore.deleteItemAsync(STORE);
  await SecureStore.deleteItemAsync(RESTORE_SKIPPED);
}

/** After sign-in: offer a restore when this phone has no chats, the account has a backup, and it wasn't skipped. */
export async function shouldOfferRestore(localChatCount: number) {
  if (localChatCount > 0 || (await backupEnabledHere()) || (await SecureStore.getItemAsync(RESTORE_SKIPPED))) return false;
  return (await backupInfo().catch(() => ({ exists: false }) as BackupInfo)).exists;
}
