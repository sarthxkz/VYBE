import { activeLabel, shortAgo, themeById, THEMES } from '../look';

const now = Date.parse('2026-10-21T12:00:00Z');
const before = (ms: number) => new Date(now - ms).toISOString();

test('presence label', () => {
  expect(activeLabel(true, null, now)).toBe('Active now');
  expect(activeLabel(false, null, now)).toBeNull();
  expect(activeLabel(null, before(20_000), now)).toBe('Active just now');
  expect(activeLabel(false, before(5 * 60_000), now)).toBe('Active 5m ago');
  expect(activeLabel(false, before(3 * 3600_000), now)).toBe('Active 3h ago');
  expect(activeLabel(false, before(30 * 3600_000), now)).toBe('Active yesterday');
  expect(activeLabel(false, before(4 * 86_400_000), now)).toBe('Active 4d ago');
  expect(activeLabel(false, before(9 * 86_400_000), now)).toBeNull();
});

test('short time', () => {
  expect(shortAgo(now - 10_000, now)).toBe('now');
  expect(shortAgo(now - 4 * 60_000, now)).toBe('4m');
  expect(shortAgo(now - 2 * 3600_000, now)).toBe('2h');
  expect(shortAgo(now - 3 * 86_400_000, now)).toBe('3d');
  expect(shortAgo(now - 15 * 86_400_000, now)).toBe('2w');
});

test('themes', () => {
  expect(themeById('sunset')?.name).toBe('Sunset');
  expect(themeById('nope')).toBeNull();
  expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
});
