import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { create } from 'zustand';

// Decrypted chat history lives only here: an SQLCipher database whose key is in Keystore-backed SecureStore.
const KEY_NAME = 'vybe.chatDbKey';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
export type ChatMessage = {
  id: string; // client message id (same on both devices)
  peerId: string;
  fromMe: number;
  kind: 'text' | 'image' | 'system';
  body: string | null;
  replyTo: string | null;
  image: string | null; // JSON: { mediaId, key, w, h }
  status: MessageStatus;
  createdAt: number;
  deleted: number;
};

/** Bumped on every write so screens re-query. */
export const useChatVersion = create<{ v: number; bump: () => void }>((set) => ({ v: 0, bump: () => set((s) => ({ v: s.v + 1 })) }));

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function dbKey() {
  let k = await SecureStore.getItemAsync(KEY_NAME);
  if (!k) {
    k = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, k, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  return k;
}

export function chatDb() {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('vybe-chat.db');
    // Raw hex key (x'..') skips SQLCipher's KDF; the key is already 256 random bits.
    await db.execAsync(`PRAGMA key = "x'${await dbKey()}'";`);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        peerId TEXT NOT NULL,
        fromMe INTEGER NOT NULL,
        kind TEXT NOT NULL,
        body TEXT,
        replyTo TEXT,
        image TEXT,
        status TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS messages_peer ON messages(peerId, createdAt);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT);
    `);
    return db;
  })();
  return dbPromise;
}

export async function insertMessage(m: ChatMessage) {
  const db = await chatDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO messages (id, peerId, fromMe, kind, body, replyTo, image, status, createdAt, deleted) VALUES (?,?,?,?,?,?,?,?,?,?)',
    m.id, m.peerId, m.fromMe, m.kind, m.body, m.replyTo, m.image, m.status, m.createdAt, m.deleted,
  );
  useChatVersion.getState().bump();
}

const order: MessageStatus[] = ['failed', 'sending', 'sent', 'delivered', 'read'];

/** Status only moves forward (a late "delivered" never overwrites "read"). */
export async function setStatus(id: string, status: MessageStatus, peerId?: string) {
  const db = await chatDb();
  const row = await db.getFirstAsync<{ status: MessageStatus }>(
    'SELECT status FROM messages WHERE id = ? AND fromMe = 1 AND (? IS NULL OR peerId = ?)',
    id, peerId ?? null, peerId ?? null,
  );
  if (!row) return;
  if (status !== 'failed' && order.indexOf(status) <= order.indexOf(row.status)) return;
  await db.runAsync('UPDATE messages SET status = ? WHERE id = ?', status, id);
  useChatVersion.getState().bump();
}

/** fromMe: 1 when I delete my own message, 0 when a peer deletes theirs (a peer can never delete mine). */
export async function markDeleted(id: string, peerId: string, fromMe: 0 | 1) {
  const db = await chatDb();
  await db.runAsync('UPDATE messages SET deleted = 1, body = NULL, image = NULL WHERE id = ? AND peerId = ? AND fromMe = ?', id, peerId, fromMe);
  useChatVersion.getState().bump();
}

export async function messagesWith(peerId: string, limit = 200) {
  const db = await chatDb();
  const rows = await db.getAllAsync<ChatMessage>('SELECT * FROM messages WHERE peerId = ? ORDER BY createdAt DESC LIMIT ?', peerId, limit);
  return rows.reverse();
}

export async function conversations() {
  const db = await chatDb();
  return db.getAllAsync<ChatMessage & { unread: number }>(`
    SELECT m.*, (SELECT COUNT(*) FROM messages u WHERE u.peerId = m.peerId AND u.fromMe = 0 AND u.status = 'received') AS unread
    FROM messages m
    WHERE m.createdAt = (SELECT MAX(createdAt) FROM messages x WHERE x.peerId = m.peerId)
    GROUP BY m.peerId
    ORDER BY m.createdAt DESC`);
}

export async function unsent() {
  const db = await chatDb();
  return db.getAllAsync<ChatMessage>("SELECT * FROM messages WHERE fromMe = 1 AND status IN ('sending','failed') ORDER BY createdAt");
}

export async function deleteConversation(peerId: string) {
  const db = await chatDb();
  await db.runAsync('DELETE FROM messages WHERE peerId = ?', peerId);
  useChatVersion.getState().bump();
}

/** Everything, for the encrypted backup. */
export async function allMessages() {
  return (await chatDb()).getAllAsync<ChatMessage>('SELECT * FROM messages ORDER BY createdAt');
}

/** Restore from a backup: keeps anything already on this phone (same ids win locally). */
export async function importMessages(list: ChatMessage[]) {
  const db = await chatDb();
  await db.withTransactionAsync(async () => {
    for (const m of list) {
      await db.runAsync(
        'INSERT OR IGNORE INTO messages (id, peerId, fromMe, kind, body, replyTo, image, status, createdAt, deleted) VALUES (?,?,?,?,?,?,?,?,?,?)',
        m.id, m.peerId, m.fromMe, m.kind, m.body, m.replyTo, m.image, m.status === 'sending' ? 'failed' : m.status, m.createdAt, m.deleted,
      );
    }
  });
  useChatVersion.getState().bump();
}

export async function kvGet(k: string) {
  return (await (await chatDb()).getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', k))?.v ?? null;
}
export async function kvSet(k: string, v: string) {
  await (await chatDb()).runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, v);
}

/** Sign-out / account deletion: destroy local history and its key. */
export async function wipeChatDb() {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync().catch(() => {});
  }
  dbPromise = null;
  await SQLite.deleteDatabaseAsync('vybe-chat.db').catch(() => {});
  await SecureStore.deleteItemAsync(KEY_NAME);
}
