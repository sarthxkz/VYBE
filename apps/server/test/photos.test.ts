import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { api, befriend, makeUser, resetDb, type TestUser } from './helpers.js';
import { mediaPath } from '../src/lib/media.js';

beforeEach(resetDb);

const jpegWithExif = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#ff6b4a' } })
    .withExif({ IFD0: { Artist: 'secret-artist', Copyright: 'leaky' } })
    .jpeg()
    .toBuffer();

const upload = (u: TestUser, buf: Buffer, kind = 'PHOTO', extra: Record<string, string> = {}) => {
  const req = api().post('/v1/media').set(u.auth).field('kind', kind);
  for (const [k, v] of Object.entries(extra)) req.field(k, v);
  return req.attach('file', buf, { filename: 'x.jpg', contentType: 'image/jpeg' });
};

async function sendPhoto(sender: TestUser, recipients: TestUser[]) {
  const m = await upload(sender, await jpegWithExif()).expect(201);
  const p = await api()
    .post('/v1/photos')
    .set(sender.auth)
    .send({ mediaId: m.body.id, caption: 'hi', recipientIds: recipients.map((r) => r.id) })
    .expect(201);
  return { mediaId: m.body.id as string, postId: p.body.id as string };
}

describe('media upload', () => {
  it('re-encodes images and strips EXIF metadata', async () => {
    const u = await makeUser();
    const r = await upload(u, await jpegWithExif()).expect(201);
    const got = await api().get(`/v1/media/${r.body.id}`).set(u.auth).expect(200).buffer(true);
    const meta = await sharp(got.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect((got.body as Buffer).toString('latin1')).not.toContain('secret-artist');
    expect(got.headers['cache-control']).toContain('private');
  });

  it('rejects non-images disguised as images', async () => {
    const u = await makeUser();
    const r = await upload(u, Buffer.from('<?php system($_GET["c"]); ?>')).expect(400);
    expect(r.body.error.code).toBe('INVALID_IMAGE');
  });

  it('rejects oversized images', async () => {
    const u = await makeUser();
    const r = await upload(u, Buffer.alloc(13 * 1024 * 1024, 1)).expect(400);
    expect(r.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('chat blobs need a friend audience', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await upload(a, Buffer.from('ciphertext'), 'CHAT_BLOB', { audienceUserId: b.id }).expect(400);
    await befriend(a, b);
    const r = await upload(a, Buffer.from('ciphertext'), 'CHAT_BLOB', { audienceUserId: b.id }).expect(201);
    await api().get(`/v1/media/${r.body.id}`).set(b.auth).expect(200);
    const c = await makeUser();
    await api().get(`/v1/media/${r.body.id}`).set(c.auth).expect(404);
  });
});

describe('private photos', () => {
  it('only recipients and the sender can see a photo; ids cannot be swapped', async () => {
    const s = await makeUser();
    const r = await makeUser();
    const other = await makeUser();
    await befriend(s, r);
    await befriend(s, other);
    const { mediaId, postId } = await sendPhoto(s, [r]);
    await api().get(`/v1/media/${mediaId}`).expect(401);
    await api().get(`/v1/media/${mediaId}`).set(r.auth).expect(200);
    await api().get(`/v1/media/${mediaId}`).set(other.auth).expect(404);
    await api().get(`/v1/photos/${postId}`).set(other.auth).expect(404);
    const inbox = await api().get('/v1/photos/inbox').set(r.auth).expect(200);
    expect(inbox.body.items.map((i: { id: string }) => i.id)).toEqual([postId]);
    expect((await api().get('/v1/photos/inbox').set(other.auth)).body.items).toEqual([]);
  });

  it('cannot send to non-friends or reuse someone else’s media', async () => {
    const s = await makeUser();
    const stranger = await makeUser();
    const thief = await makeUser();
    await befriend(thief, stranger);
    const m = await upload(s, await jpegWithExif()).expect(201);
    await api().post('/v1/photos').set(s.auth).send({ mediaId: m.body.id, recipientIds: [stranger.id] }).expect(400);
    await api().post('/v1/photos').set(thief.auth).send({ mediaId: m.body.id, recipientIds: [stranger.id] }).expect(400);
  });

  it('blocking the sender hides their photos from the recipient', async () => {
    const s = await makeUser();
    const r = await makeUser();
    await befriend(s, r);
    const { mediaId } = await sendPhoto(s, [r]);
    await api().post('/v1/blocks').set(r.auth).send({ userId: s.id }).expect(200);
    expect((await api().get('/v1/photos/inbox').set(r.auth)).body.items).toEqual([]);
    await api().get(`/v1/media/${mediaId}`).set(r.auth).expect(404);
  });

  it('sender delete removes the file for everyone', async () => {
    const s = await makeUser();
    const r = await makeUser();
    await befriend(s, r);
    const { mediaId, postId } = await sendPhoto(s, [r]);
    expect(existsSync(mediaPath(mediaId))).toBe(true);
    await api().delete(`/v1/photos/${postId}`).set(r.auth).expect(200); // recipient: hide only
    await api().get(`/v1/media/${mediaId}`).set(s.auth).expect(200);
    await api().delete(`/v1/photos/${postId}`).set(s.auth).expect(200);
    expect(existsSync(mediaPath(mediaId))).toBe(false);
    await api().get(`/v1/media/${mediaId}`).set(s.auth).expect(404);
  });

  it('reports on a photo require having seen it', async () => {
    const s = await makeUser();
    const r = await makeUser();
    const other = await makeUser();
    await befriend(s, r);
    const { postId } = await sendPhoto(s, [r]);
    await api().post('/v1/reports').set(other.auth).send({ targetUserId: s.id, photoPostId: postId, reason: 'spam' }).expect(404);
    await api().post('/v1/reports').set(r.auth).send({ targetUserId: s.id, photoPostId: postId, reason: 'spam' }).expect(201);
  });
});
