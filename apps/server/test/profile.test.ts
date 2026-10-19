import { beforeEach, describe, expect, it } from 'vitest';
import { api, befriend, makeUser, resetDb } from './helpers.js';
import { db } from '../src/lib/db.js';

beforeEach(resetDb);

const look = {
  skin: 2,
  face: 1,
  hair: 4,
  hairColor: 3,
  eyes: 0,
  mouth: 2,
  accessory: 1,
  outfit: 5,
};

describe('illustrated avatar', () => {
  it('saves a valid style, shows it publicly, and can be cleared', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await api().patch('/v1/me').set(a.auth).send({ avatarStyle: look }).expect(200);
    const seen = await api().get(`/v1/users/${a.id}`).set(b.auth).expect(200);
    expect(seen.body.avatarStyle).toEqual(look);
    await api().patch('/v1/me').set(a.auth).send({ avatarStyle: null }).expect(200);
    expect((await api().get('/v1/me').set(a.auth)).body.avatarStyle).toBeNull();
  });

  it('rejects out-of-range parts and unknown keys', async () => {
    const a = await makeUser();
    await api()
      .patch('/v1/me')
      .set(a.auth)
      .send({ avatarStyle: { ...look, hair: 99 } })
      .expect(400);
    await api()
      .patch('/v1/me')
      .set(a.auth)
      .send({ avatarStyle: { ...look, script: '<x>' } })
      .expect(400);
  });
});

describe('mood', () => {
  it('friends see it; non-friends and search never do', async () => {
    const [a, friend, stranger] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    await befriend(a, friend);
    await api()
      .put('/v1/me/mood')
      .set(a.auth)
      .send({ emoji: '😎', text: 'at the beach' })
      .expect(200);

    const fromFriend = await api().get('/v1/locations/friends').set(friend.auth).expect(200);
    expect(fromFriend.body.friends[0].user.mood).toMatchObject({
      emoji: '😎',
      text: 'at the beach',
    });
    expect((await api().get('/v1/friends').set(friend.auth)).body.friends[0].mood.emoji).toBe('😎');

    expect(
      (await api().get(`/v1/users/${a.id}`).set(stranger.auth).expect(200)).body.mood,
    ).toBeNull();
    const search = await api()
      .get(`/v1/users/search?q=${a.username.slice(0, 5)}`)
      .set(stranger.auth)
      .expect(200);
    expect(search.body.users[0]).not.toHaveProperty('mood');
    expect(search.body.users[0]).not.toHaveProperty('moodEmoji');
  });

  it('expires after 24 hours and can be cleared', async () => {
    const [a, friend] = await Promise.all([makeUser(), makeUser()]);
    await befriend(a, friend);
    await api().put('/v1/me/mood').set(a.auth).send({ emoji: '🎉' }).expect(200);
    await db.user.update({
      where: { id: a.id },
      data: { moodSetAt: new Date(Date.now() - 25 * 3600_000) },
    });
    expect((await api().get(`/v1/users/${a.id}`).set(friend.auth)).body.mood).toBeNull();

    await api().put('/v1/me/mood').set(a.auth).send({ emoji: '🎉' }).expect(200);
    await api().delete('/v1/me/mood').set(a.auth).expect(200);
    expect((await api().get('/v1/me').set(a.auth)).body.mood).toBeNull();
  });

  it('accepts exactly one emoji (including ZWJ and skin tones) and a short line', async () => {
    const a = await makeUser();
    for (const ok of ['😎', '👩🏽‍💻', '❤️', '🏳️‍🌈'])
      await api().put('/v1/me/mood').set(a.auth).send({ emoji: ok }).expect(200);
    for (const bad of ['', 'hi', '😎😎', '<b>', '😎 x'])
      await api().put('/v1/me/mood').set(a.auth).send({ emoji: bad }).expect(400);
    await api()
      .put('/v1/me/mood')
      .set(a.auth)
      .send({ emoji: '😎', text: 'x'.repeat(41) })
      .expect(400);
  });
});
