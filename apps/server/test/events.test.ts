import { beforeEach, describe, expect, it } from 'vitest';
import { api, befriend, makeUser, resetDb } from './helpers.js';
import { db } from '../src/lib/db.js';
import { runCleanup } from '../src/jobs.js';

beforeEach(resetDb);

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const party = { title: "Party at Riya's", emoji: '🎉', lat: 28.61, lng: 77.2, startsAt: inHours(1), endsAt: inHours(4) };

describe('event pins', () => {
  it('friends see them; strangers and blocked users do not; only the creator deletes', async () => {
    const [host, friend, stranger] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    await befriend(host, friend);
    const { body } = await api().post('/v1/events').set(host.auth).send(party).expect(201);

    expect((await api().get('/v1/events').set(friend.auth)).body.events[0]).toMatchObject({ id: body.id, title: party.title, creator: { id: host.id } });
    expect((await api().get('/v1/events').set(host.auth)).body.events).toHaveLength(1);
    expect((await api().get('/v1/events').set(stranger.auth)).body.events).toHaveLength(0);

    await api().delete(`/v1/events/${body.id}`).set(friend.auth).expect(404);
    await api().post('/v1/blocks').set(friend.auth).send({ userId: host.id }).expect(200);
    expect((await api().get('/v1/events').set(friend.auth)).body.events).toHaveLength(0);
    await api().delete(`/v1/events/${body.id}`).set(host.auth).expect(200);
  });

  it('rejects bad times, places and titles; ended events disappear and get cleaned up', async () => {
    const u = await makeUser();
    await api().post('/v1/events').set(u.auth).send({ ...party, endsAt: party.startsAt }).expect(400);
    await api().post('/v1/events').set(u.auth).send({ ...party, startsAt: inHours(1), endsAt: inHours(30) }).expect(400);
    await api().post('/v1/events').set(u.auth).send({ ...party, startsAt: inHours(200), endsAt: inHours(201) }).expect(400);
    await api().post('/v1/events').set(u.auth).send({ ...party, lat: 120 }).expect(400);
    await api().post('/v1/events').set(u.auth).send({ ...party, title: 'x'.repeat(41) }).expect(400);
    await api().post('/v1/events').set(u.auth).send({ ...party, emoji: 'party' }).expect(400);

    const { body } = await api().post('/v1/events').set(u.auth).send(party).expect(201);
    await db.event.update({ where: { id: body.id }, data: { startsAt: new Date(Date.now() - 50 * 3600_000), endsAt: new Date(Date.now() - 30 * 3600_000) } });
    expect((await api().get('/v1/events').set(u.auth)).body.events).toHaveLength(0);
    await runCleanup();
    expect(await db.event.count()).toBe(0);
  });
});
