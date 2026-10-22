import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { api, befriend, makeUser, resetDb, type TestUser } from './helpers.js';
import { db } from '../src/lib/db.js';
import { runCleanup } from '../src/jobs.js';

beforeEach(resetDb);

const jpeg = () => sharp({ create: { width: 32, height: 32, channels: 3, background: '#6c4cf5' } }).jpeg().toBuffer();

async function postStory(u: TestUser) {
  const m = await api().post('/v1/media').set(u.auth).field('kind', 'PHOTO').attach('file', await jpeg(), { filename: 'x.jpg', contentType: 'image/jpeg' }).expect(201);
  const s = await api().post('/v1/stories').set(u.auth).send({ mediaId: m.body.id, caption: 'sunset' }).expect(201);
  return { storyId: s.body.id as string, mediaId: m.body.id as string };
}

describe('stories', () => {
  it('friends see a story and the owner sees who watched; strangers see nothing', async () => {
    const a = await makeUser();
    const friend = await makeUser();
    const stranger = await makeUser();
    await befriend(a, friend);
    const { storyId, mediaId } = await postStory(a);

    const feed = await api().get('/v1/stories/feed').set(friend.auth).expect(200);
    expect(feed.body.friends).toHaveLength(1);
    expect(feed.body.friends[0].unseen).toBe(1);
    expect(feed.body.friends[0].stories[0].viewCount).toBeUndefined(); // only the owner learns the count
    await api().get(`/v1/media/${mediaId}`).set(friend.auth).expect(200);

    expect((await api().get('/v1/stories/feed').set(stranger.auth).expect(200)).body.friends).toHaveLength(0);
    await api().get(`/v1/media/${mediaId}`).set(stranger.auth).expect(404);
    await api().post(`/v1/stories/${storyId}/view`).set(stranger.auth).expect(404);

    await api().post(`/v1/stories/${storyId}/view`).set(friend.auth).expect(200);
    await api().post(`/v1/stories/${storyId}/view`).set(friend.auth).expect(200); // idempotent
    const viewers = await api().get(`/v1/stories/${storyId}/viewers`).set(a.auth).expect(200);
    expect(viewers.body.viewers.map((v: { viewer: { id: string } }) => v.viewer.id)).toEqual([friend.id]);
    await api().get(`/v1/stories/${storyId}/viewers`).set(friend.auth).expect(404);
    expect((await api().get('/v1/stories/feed').set(a.auth).expect(200)).body.mine.stories[0].viewCount).toBe(1);
  });

  it('a block hides the story immediately', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    const { mediaId } = await postStory(a);
    await db.block.create({ data: { blockerId: a.id, blockedId: b.id } });
    expect((await api().get('/v1/stories/feed').set(b.auth).expect(200)).body.friends).toHaveLength(0);
    await api().get(`/v1/media/${mediaId}`).set(b.auth).expect(404);
  });

  it('a story photo cannot also be sent as a photo post', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    const { mediaId } = await postStory(a);
    const r = await api().post('/v1/photos').set(a.auth).send({ mediaId, recipientIds: [b.id] }).expect(400);
    expect(r.body.error.code).toBe('INVALID_MEDIA');
  });

  it('cleanup keeps live stories and deletes expired ones with their file', async () => {
    const a = await makeUser();
    const live = await postStory(a);
    const old = await postStory(a);
    await db.story.update({ where: { id: old.storyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    // The orphan sweep must not mistake an old story's photo for an abandoned upload.
    await db.mediaObject.update({ where: { id: live.mediaId }, data: { createdAt: new Date(Date.now() - 23.9 * 3600_000) } });
    await runCleanup();
    expect(await db.story.findUnique({ where: { id: old.storyId } })).toBeNull();
    expect(await db.mediaObject.findUnique({ where: { id: old.mediaId } })).toBeNull();
    expect(await db.story.findUnique({ where: { id: live.storyId } })).not.toBeNull();
  });

  it('only the owner can delete a story', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    const { storyId } = await postStory(a);
    await api().delete(`/v1/stories/${storyId}`).set(b.auth).expect(404);
    await api().delete(`/v1/stories/${storyId}`).set(a.auth).expect(200);
    expect(await db.story.findUnique({ where: { id: storyId } })).toBeNull();
  });
});

describe('admin panel', () => {
  it('serves the panel page with no-store and a same-origin script policy', async () => {
    const r = await api().get('/admin/').expect(200);
    expect(r.text).toContain('Vybe Admin');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    await api().get('/admin/panel.js').expect(200);
  });

  it('overview requires an admin account', async () => {
    const user = await makeUser();
    await api().get('/v1/admin/overview').expect(401);
    await api().get('/v1/admin/overview').set(user.auth).expect(403);
    await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    const r = await api().get('/v1/admin/overview').set(user.auth).expect(200);
    expect(r.body.db.ok).toBe(true);
    expect(r.body.users.total).toBe(1);
    expect(r.body.users.signupsByDay).toHaveLength(14);
    // Aggregates only: no emails anywhere in the payload.
    expect(JSON.stringify(r.body)).not.toContain('@test.local');
  });
});
