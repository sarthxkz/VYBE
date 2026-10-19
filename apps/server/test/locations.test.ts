import { beforeEach, describe, expect, it } from 'vitest';
import { api, befriend, makeUser, resetDb, type TestUser } from './helpers.js';
import { db } from '../src/lib/db.js';
import { runCleanup } from '../src/jobs.js';

beforeEach(resetDb);

const fix = () => ({ lat: 28.6139, lng: 77.209, accuracy: 12, capturedAt: new Date().toISOString() });
const share = (u: TestUser, body: object) => api().put('/v1/locations/settings').set(u.auth).send(body);
const post = (u: TestUser, body: object = fix()) => api().post('/v1/locations').set(u.auth).send(body);
const seen = async (viewer: TestUser, owner: TestUser) => {
  const r = await api().get('/v1/locations/friends').set(viewer.auth).expect(200);
  return r.body.friends.find((f: { user: { id: string } }) => f.user.id === owner.id)?.location ?? null;
};

describe('location access control', () => {
  it('sharing is off by default and uploads are refused', async () => {
    const a = await makeUser();
    const r = await post(a).expect(409);
    expect(r.body.error.code).toBe('SHARING_OFF');
  });

  it('a friend sees it with mode ALL; a non-friend never does', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    const stranger = await makeUser();
    await befriend(owner, friend);
    await share(owner, { mode: 'ALL' }).expect(200);
    await post(owner).expect(200);
    expect(await seen(friend, owner)).toMatchObject({ lat: 28.6139, lng: 77.209 });
    expect(await seen(stranger, owner)).toBeNull();
    const r = await api().get('/v1/locations/friends').set(stranger.auth).expect(200);
    expect(JSON.stringify(r.body)).not.toContain('28.6139');
  });

  it('SELECTED mode shows only granted friends', async () => {
    const owner = await makeUser();
    const granted = await makeUser();
    const other = await makeUser();
    const outsider = await makeUser();
    await befriend(owner, granted);
    await befriend(owner, other);
    // Non-friends in the grant list are dropped silently.
    const s = await share(owner, { mode: 'SELECTED', grants: [granted.id, outsider.id] }).expect(200);
    expect(s.body.grants).toEqual([granted.id]);
    await post(owner).expect(200);
    expect(await seen(granted, owner)).not.toBeNull();
    expect(await seen(other, owner)).toBeNull();
  });

  it('Ghost Mode deletes the stored location immediately and blocks new uploads', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    await befriend(owner, friend);
    await share(owner, { mode: 'ALL' });
    await post(owner).expect(200);
    await share(owner, { ghost: true }).expect(200);
    expect(await db.currentLocation.count({ where: { userId: owner.id } })).toBe(0);
    expect(await seen(friend, owner)).toBeNull();
    // Sharing check runs before the upload throttle, so this is a clean 409.
    await post(owner).expect(409);
  });

  it('blocking hides location even if sharing with all', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    await befriend(owner, friend);
    await share(owner, { mode: 'ALL' });
    await post(owner).expect(200);
    await api().post('/v1/blocks').set(owner.auth).send({ userId: friend.id }).expect(200);
    expect(await seen(friend, owner)).toBeNull();
  });

  it('temporary sharing expires: hidden and purged by cleanup', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    await befriend(owner, friend);
    await share(owner, { mode: 'ALL', expiresAt: new Date(Date.now() + 60_000).toISOString() }).expect(200);
    await post(owner).expect(200);
    expect(await seen(friend, owner)).not.toBeNull();
    await db.locationSettings.update({ where: { userId: owner.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await seen(friend, owner)).toBeNull();
    await runCleanup();
    expect(await db.currentLocation.count()).toBe(0);
  });

  it('stale locations (>24h) are never served and are purged', async () => {
    const owner = await makeUser();
    const friend = await makeUser();
    await befriend(owner, friend);
    await share(owner, { mode: 'ALL' });
    await post(owner).expect(200);
    await db.currentLocation.update({ where: { userId: owner.id }, data: { receivedAt: new Date(Date.now() - 25 * 3600_000) } });
    expect(await seen(friend, owner)).toBeNull();
    await runCleanup();
    expect(await db.currentLocation.count()).toBe(0);
  });
});

describe('location upload validation', () => {
  it('rejects bad coordinates, stale/future timestamps and floods', async () => {
    const a = await makeUser();
    await share(a, { mode: 'ALL' });
    await post(a, { ...fix(), lat: 91 }).expect(400);
    await post(a, { ...fix(), lng: -181 }).expect(400);
    await post(a, { ...fix(), capturedAt: new Date(Date.now() - 3600_000).toISOString() }).expect(400);
    await post(a, { ...fix(), capturedAt: new Date(Date.now() + 3600_000).toISOString() }).expect(400);
    await post(a).expect(200);
    await post(a).expect(429);
  });

  it('server stamps receivedAt; the client cannot set it', async () => {
    const a = await makeUser();
    await share(a, { mode: 'ALL' });
    await post(a, { ...fix(), receivedAt: '2000-01-01T00:00:00Z' }).expect(200);
    const row = await db.currentLocation.findUniqueOrThrow({ where: { userId: a.id } });
    expect(Date.now() - row.receivedAt.getTime()).toBeLessThan(10_000);
  });

  it('rejects bad expiry windows', async () => {
    const a = await makeUser();
    await share(a, { mode: 'ALL', expiresAt: new Date(Date.now() - 1000).toISOString() }).expect(400);
    await share(a, { mode: 'ALL', expiresAt: new Date(Date.now() + 8 * 24 * 3600_000).toISOString() }).expect(400);
  });
});
