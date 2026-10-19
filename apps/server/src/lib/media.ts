import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { db } from './db.js';
import { logger } from './logger.js';

// shortcut: local-disk storage on the single VM (backed up with the DB); move to private object storage for multi-host.
export const mediaRoot = path.resolve(config.MEDIA_DIR);

/** Ids are server-generated UUIDs, so the path can never escape mediaRoot. */
export const mediaPath = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('bad media id');
  return path.join(mediaRoot, id);
};

export async function writeMedia(id: string, bytes: Buffer) {
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  await writeFile(mediaPath(id), bytes, { mode: 0o600, flag: 'wx' });
}

/** Removes rows and their files. Files are removed after rows so a crash leaves orphans, never dangling rows. */
export async function deleteMedia(ids: string[]) {
  if (!ids.length) return;
  await db.mediaObject.deleteMany({ where: { id: { in: ids } } });
  await unlinkMedia(ids);
}

export async function unlinkMedia(ids: string[]) {
  for (const id of ids) await rm(mediaPath(id), { force: true }).catch((err) => logger.error({ err, id }, 'media unlink failed'));
}
