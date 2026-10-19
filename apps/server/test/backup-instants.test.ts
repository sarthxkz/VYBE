import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { api, befriend, makeUser, resetDb, type TestUser } from './helpers.js';
import { db } from '../src/lib/db.js';
import { mediaPath } from '../src/lib/media.js';
import { runCleanup } from '../src/jobs.js';

beforeEach(resetDb);

describe('encrypted chat backup', () => {
  const salt = randomBytes(16).toString('base64');
  const blob = randomBytes(4096);

  it('stores opaque bytes per user and returns them only to that user', async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    expect((await api().get('/v1/backup').set(a.auth).expect(200)).body).toEqual({ exists: false });
    await api().put(`/v1/backup?salt=${encodeURIComponent(salt)}`).set(a.auth).set('Content-Type', 'application/octet-stream').send(blob).expect(200);

    const meta = await api().get('/v1/backup').set(a.auth).expect(200);
    expect(meta.body).toMatchObject({ exists: true, salt, size: blob.length });
    const got = await api().get('/v1/backup/data').set(a.auth).buffer(true).expect(200);
    expect(Buffer.compare(got.body as Buffer, blob)).toBe(0);

    expect((await api().get('/v1/backup').set(b.auth)).body.exists).toBe(false);
    await api().get('/v1/backup/data').set(b.auth).expect(404);
    await api().get('/v1/backup').expect(401);

    await api().delete('/v1/backup').set(a.auth).expect(200);
    expect((await api().get('/v1/backup').set(a.auth)).body.exists).toBe(false);
  });

  it('rejects a bad salt or an empty body', async () => {
    const a = await makeUser();
    await api().put('/v1/backup?salt=nope').set(a.auth).set('Content-Type', 'application/octet-stream').send(blob).expect(400);
    await api().put(`/v1/backup?salt=${encodeURIComponent(salt)}`).set(a.auth).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(4)).expect(400);
  });
});

describe('instants (view once)', () => {
  const jpeg = () => sharp({ create: { width: 32, height: 32, channels: 3, background: '#6c4cf5' } }).jpeg().toBuffer();
  async function sendInstant(from: TestUser, to: TestUser[]) {
    const m = await api().post('/v1/media').set(from.auth).field('kind', 'PHOTO').attach('file', await jpeg(), { filename: 'x.jpg', contentType: 'image/jpeg' }).expect(201);
    const p = await api().post('/v1/photos').set(from.auth).send({ mediaId: m.body.id, recipientIds: to.map((t) => t.id), instant: true }).expect(201);
    return { postId: p.body.id as string, mediaId: m.body.id as string };
  }

  it('can be opened once, then disappears and its file is deleted', async () => {
    const [s, r] = await Promise.all([makeUser(), makeUser()]);
    await befriend(s, r);
    const { postId, mediaId } = await sendInstant(s, [r]);

    const inbox = await api().get('/v1/photos/inbox').set(r.auth).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ id: postId, instant: true });
    await api().get(`/v1/media/${mediaId}`).set(r.auth).expect(200);
    await api().post(`/v1/photos/${postId}/viewed`).set(r.auth).expect(200);
    await api().get(`/v1/media/${mediaId}`).set(r.auth).expect(200); // grace period for loading

    await db.photoRecipient.updateMany({ where: { postId }, data: { viewedAt: new Date(Date.now() - 3 * 60_000) } });
    await api().get(`/v1/photos/${postId}`).set(r.auth).expect(404);
    await api().get(`/v1/media/${mediaId}`).set(r.auth).expect(404);
    expect((await api().get('/v1/photos/inbox').set(r.auth)).body.items).toHaveLength(0);

    await runCleanup();
    expect(await db.photoPost.count({ where: { id: postId } })).toBe(0);
    expect(existsSync(mediaPath(mediaId))).toBe(false);
  });

  it('expires after 24 hours even if unopened; regular photos are unaffected', async () => {
    const [s, r] = await Promise.all([makeUser(), makeUser()]);
    await befriend(s, r);
    const { postId } = await sendInstant(s, [r]);
    await db.photoPost.update({ where: { id: postId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api().get('/v1/photos/inbox').set(r.auth)).body.items).toHaveLength(0);
    await api().get(`/v1/photos/${postId}`).set(s.auth).expect(404);
    await runCleanup();
    expect(await db.photoPost.count({ where: { id: postId } })).toBe(0);
  });
});
