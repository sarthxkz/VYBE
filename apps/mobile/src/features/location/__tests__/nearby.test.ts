import { distanceM, nearbyChanges, type NearbyState } from '../nearby';
import type { FriendLocation } from '@/api/types';

const me = { lat: 28.6139, lng: 77.209 };
const at = (dLatM: number, ageMs = 0, now = 1_000_000_000): FriendLocation => ({
  user: {
    id: 'f1',
    username: 'riya',
    displayName: 'Riya',
    avatarMediaId: null,
    avatarStyle: null,
    bio: null,
    mood: { emoji: '😎', text: null, setAt: '' },
  },
  sharing: true,
  location: {
    lat: me.lat + dLatM / 111_320,
    lng: me.lng,
    accuracy: 10,
    capturedAt: '',
    receivedAt: new Date(now - ageMs).toISOString(),
  },
});

test('distance is about right', () => {
  expect(Math.round(distanceM(me, { lat: me.lat + 1000 / 111_320, lng: me.lng }))).toBeGreaterThan(
    990,
  );
});

test('alerts once on arrival, re-arms only after moving away, respects the cooldown', () => {
  let now = 1_000_000_000;
  let s: NearbyState = {};
  let r = nearbyChanges(s, me, [at(120, 0, now)], now);
  expect(r.alerts).toEqual([{ id: 'f1', name: 'Riya', meters: 120, mood: '😎' }]);
  s = r.state;

  now += 5 * 60_000; // still close: no repeat
  r = nearbyChanges(s, me, [at(80, 0, now)], now);
  expect(r.alerts).toHaveLength(0);
  s = r.state;

  now += 5 * 60_000; // 400 m: inside the re-arm band, still "near"
  s = nearbyChanges(s, me, [at(400, 0, now)], now).state;
  now += 60_000;
  expect(nearbyChanges(s, me, [at(100, 0, now)], now).alerts).toHaveLength(0);

  now += 60_000; // left (700 m), came back within the hour: cooldown holds
  s = nearbyChanges(s, me, [at(700, 0, now)], now).state;
  now += 60_000;
  expect(nearbyChanges(s, me, [at(100, 0, now)], now).alerts).toHaveLength(0);

  now += 60 * 60_000; // after the cooldown: alerts again
  expect(nearbyChanges(s, me, [at(100, 0, now)], now).alerts).toHaveLength(1);
});

test('ignores stale fixes and friends without a location', () => {
  const now = 1_000_000_000;
  expect(nearbyChanges({}, me, [at(50, 11 * 60_000, now)], now).alerts).toHaveLength(0);
  expect(nearbyChanges({}, me, [{ ...at(50, 0, now), location: null }], now).alerts).toHaveLength(
    0,
  );
});
