import { beforeEach, describe, expect, it } from 'vitest';
import { api, befriend, makeUser, resetDb } from './helpers.js';
import { db } from '../src/lib/db.js';

beforeEach(resetDb);

describe('friend request lifecycle', () => {
  it('send → accept → friends both ways → remove', async () => {
    const a = await makeUser('anna');
    const b = await makeUser('ben');
    const r = await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(201);
    const inc = await api().get('/v1/friends/requests').set(b.auth).expect(200);
    expect(inc.body.incoming[0].user.id).toBe(a.id);
    // Only the recipient can accept.
    await api().post(`/v1/friends/requests/${r.body.id}/accept`).set(a.auth).expect(404);
    await api().post(`/v1/friends/requests/${r.body.id}/accept`).set(b.auth).expect(200);
    expect((await api().get('/v1/friends').set(a.auth)).body.friends.map((f: { id: string }) => f.id)).toEqual([b.id]);
    expect((await api().get('/v1/friends').set(b.auth)).body.friends.map((f: { id: string }) => f.id)).toEqual([a.id]);
    await api().delete(`/v1/friends/${a.id}`).set(b.auth).expect(200);
    expect((await api().get('/v1/friends').set(a.auth)).body.friends).toEqual([]);
  });

  it('duplicate requests are idempotent and reverse requests auto-accept', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(201);
    const dup = await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(200);
    expect(dup.body.status).toBe('pending');
    const back = await api().post('/v1/friends/requests').set(b.auth).send({ userId: a.id }).expect(200);
    expect(back.body.status).toBe('accepted');
    await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(409);
  });

  it('concurrent opposite requests end in exactly one friendship and no request', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await Promise.all([
      api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }),
      api().post('/v1/friends/requests').set(b.auth).send({ userId: a.id }),
    ]);
    const reqs = await db.friendRequest.count();
    const friends = await db.friendship.count();
    // Either one pending request, or (if the second saw the first) a friendship — never two requests.
    expect(reqs + friends).toBe(1);
  });

  it('reject and cancel', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const r1 = await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(201);
    await api().delete(`/v1/friends/requests/${r1.body.id}`).set(b.auth).expect(404); // only sender cancels
    await api().delete(`/v1/friends/requests/${r1.body.id}`).set(a.auth).expect(200);
    const r2 = await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(201);
    await api().post(`/v1/friends/requests/${r2.body.id}/reject`).set(b.auth).expect(200);
    expect(await db.friendship.count()).toBe(0);
  });

  it('cannot friend yourself or a user without a profile', async () => {
    const a = await makeUser();
    await api().post('/v1/friends/requests').set(a.auth).send({ userId: a.id }).expect(400);
    await api().post('/v1/friends/requests').set(a.auth).send({ userId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });
});

describe('blocking', () => {
  it('removes friendship, prevents requests both ways, hides from search', async () => {
    const a = await makeUser('blocker');
    const b = await makeUser('blockee');
    await befriend(a, b);
    await api().post('/v1/blocks').set(a.auth).send({ userId: b.id }).expect(200);
    expect(await db.friendship.count()).toBe(0);
    const r1 = await api().post('/v1/friends/requests').set(b.auth).send({ userId: a.id }).expect(404);
    expect(r1.body.error.code).toBe('USER_NOT_FOUND');
    await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(404);
    expect((await api().get('/v1/users/search?q=blo').set(b.auth)).body.users).toEqual([]);
    await api().get(`/v1/users/${a.id}`).set(b.auth).expect(404);
    expect((await api().get('/v1/blocks').set(a.auth)).body.blocked[0].id).toBe(b.id);
    await api().delete(`/v1/blocks/${b.id}`).set(a.auth).expect(200);
    expect((await api().get('/v1/users/search?q=blo').set(b.auth)).body.users).toHaveLength(1);
  });
});

describe('search', () => {
  it('needs 3+ chars and returns relationship', async () => {
    const a = await makeUser('searcher');
    const b = await makeUser('sea_lion');
    await api().get('/v1/users/search?q=se').set(a.auth).expect(400);
    await api().post('/v1/friends/requests').set(a.auth).send({ userId: b.id }).expect(201);
    const r = await api().get('/v1/users/search?q=sea').set(a.auth).expect(200);
    expect(r.body.users).toEqual([expect.objectContaining({ id: b.id, relationship: 'request_sent' })]);
    expect(r.body.users[0].email).toBeUndefined();
  });
});
