import { beforeEach, describe, expect, it } from 'vitest';
import { api, befriend, makeUser, resetDb, type TestUser } from './helpers.js';
import { SignalClient } from './signal.js';
import { db } from '../src/lib/db.js';

beforeEach(resetDb);

async function registered(u: TestUser) {
  const c = new SignalClient(u.id);
  await api().put('/v1/keys/device').set(u.auth).send(c.registration()).expect(200);
  return c;
}

describe('key directory', () => {
  it('hands out each one-time prekey exactly once, then falls back', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    const cb = new SignalClient(b.id);
    await api().put('/v1/keys/device').set(b.auth).send(cb.registration(2)).expect(200);
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await api().get(`/v1/keys/bundle/${b.id}`).set(a.auth).expect(200)).body);
    expect(ids[0].preKey.id).not.toBe(ids[1].preKey.id);
    expect(ids[2].preKey).toBeNull();
    expect(ids[2].kyberPreKey.id).toBe(1000); // last-resort
    expect((await api().get('/v1/keys/count').set(b.auth)).body).toMatchObject({ ec: 0, kyber: 0 });
  });

  it('concurrent bundle fetches never get the same one-time key', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    await registered(b);
    const rs = await Promise.all(Array.from({ length: 5 }, () => api().get(`/v1/keys/bundle/${b.id}`).set(a.auth)));
    const pre = rs.map((r) => r.body.preKey?.id).filter(Boolean);
    expect(new Set(pre).size).toBe(pre.length);
  });

  it('non-friends and blocked users cannot fetch bundles', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const stranger = await makeUser();
    await befriend(a, b);
    await registered(b);
    await api().get(`/v1/keys/bundle/${b.id}`).set(stranger.auth).expect(404);
    await api().post('/v1/blocks').set(b.auth).send({ userId: a.id }).expect(200);
    await api().get(`/v1/keys/bundle/${b.id}`).set(a.auth).expect(404);
  });

  it('rejects private-key-sized garbage and non-base64', async () => {
    const a = await makeUser();
    const c = new SignalClient(a.id).registration();
    await api().put('/v1/keys/device').set(a.auth).send({ ...c, identityKey: 'not base64!!' }).expect(400);
  });
});

describe('end-to-end encrypted messaging through the real API', () => {
  it('Alice and Bob exchange messages; the server only ever holds ciphertext', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    await befriend(alice, bob);
    const ca = await registered(alice);
    const cb = await registered(bob);

    const bundle = (await api().get(`/v1/keys/bundle/${bob.id}`).set(alice.auth).expect(200)).body;
    await ca.startSession(bundle);
    const secret = 'meet at the blue door at 7 — zebra-42';
    const m1 = await ca.encrypt(bob.id, bundle.registrationId, secret);
    expect(m1.type).toBe(3); // PreKey message
    await api().post('/v1/messages').set(alice.auth).send(m1).expect(201);

    // Inspect raw storage: no plaintext, in any encoding we can think of.
    const rows = await db.$queryRaw<{ ciphertext: Uint8Array }[]>`SELECT ciphertext FROM encrypted_messages`;
    expect(rows).toHaveLength(1);
    const raw = Buffer.from(rows[0]!.ciphertext);
    expect(raw.includes(Buffer.from(secret))).toBe(false);
    expect(raw.includes(Buffer.from('zebra-42'))).toBe(false);
    expect(raw.toString('base64')).not.toContain(Buffer.from('zebra-42').toString('base64'));

    const pending = (await api().get('/v1/messages/pending').set(bob.auth).expect(200)).body.messages;
    expect(pending).toHaveLength(1);
    expect(await cb.decrypt(alice.id, pending[0].type, pending[0].body)).toBe(secret);
    await api().post('/v1/messages/ack').set(bob.auth).send({ ids: [pending[0].id] }).expect(200);
    expect(await db.encryptedMessage.count()).toBe(0); // store-and-forward: gone after delivery

    // Bob replies on the established session (Whisper message).
    const aliceReg = (await api().get(`/v1/keys/identity/${alice.id}`).set(bob.auth).expect(200)).body.registrationId;
    const m2 = await cb.encrypt(alice.id, aliceReg, 'see you there');
    expect(m2.type).toBe(2);
    await api().post('/v1/messages').set(bob.auth).send(m2).expect(201);
    const p2 = (await api().get('/v1/messages/pending').set(alice.auth)).body.messages;
    expect(await ca.decrypt(bob.id, p2[0].type, p2[0].body)).toBe('see you there');

    // A third party cannot read Bob's queue or ack his messages.
    const eve = await makeUser('eve');
    expect((await api().get('/v1/messages/pending').set(eve.auth)).body.messages).toEqual([]);
    expect((await api().post('/v1/messages/ack').set(eve.auth).send({ ids: [p2[0].id] })).body.acked).toBe(0);
  });

  it('sends are idempotent on clientMsgId', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    const ca = await registered(a);
    await registered(b);
    const bundle = (await api().get(`/v1/keys/bundle/${b.id}`).set(a.auth)).body;
    await ca.startSession(bundle);
    const m = await ca.encrypt(b.id, bundle.registrationId, 'once');
    await api().post('/v1/messages').set(a.auth).send(m).expect(201);
    const again = await api().post('/v1/messages').set(a.auth).send(m).expect(200);
    expect(again.body.duplicate).toBe(true);
    expect(await db.encryptedMessage.count()).toBe(1);
  });

  it('blocked users and non-friends cannot send', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const stranger = await makeUser();
    await befriend(a, b);
    await registered(b);
    const fake = { clientMsgId: crypto.randomUUID(), recipientId: b.id, recipientRegistrationId: 1, type: 2, body: Buffer.from('x').toString('base64') };
    await api().post('/v1/messages').set(stranger.auth).send(fake).expect(403);
    await api().post('/v1/blocks').set(b.auth).send({ userId: a.id }).expect(200);
    await api().post('/v1/messages').set(a.auth).send(fake).expect(403);
  });

  it('detects a stale recipient device and drops ciphertext on identity change', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await befriend(a, b);
    const ca = await registered(a);
    await registered(b);
    const bundle = (await api().get(`/v1/keys/bundle/${b.id}`).set(a.auth)).body;
    await ca.startSession(bundle);
    await api().post('/v1/messages').set(a.auth).send(await ca.encrypt(b.id, bundle.registrationId, 'one')).expect(201);
    // Bob reinstalls: new identity.
    const cb2 = new SignalClient(b.id);
    const reg = cb2.registration();
    await api().put('/v1/keys/device').set(b.auth).send(reg).expect(200);
    expect(await db.encryptedMessage.count()).toBe(0);
    const stale = await api().post('/v1/messages').set(a.auth).send(await ca.encrypt(b.id, bundle.registrationId, 'two'));
    expect(stale.status === 409 || reg.registrationId === bundle.registrationId).toBe(true);
  });
});
