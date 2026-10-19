/// <reference types="jest" />
jest.mock('expo-location', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('@/api/client', () => ({ api: jest.fn(), ApiError: class extends Error {} }));

/* eslint-disable import/first -- jest.mock calls must precede the imports they affect */
import { cluster } from '../cluster';
import { ago, freshness } from '../tracking';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('freshness', () => {
  it('uses the server receive time, not the requested interval', () => {
    expect(freshness(iso(60_000), NOW)).toBe('fresh');
    expect(freshness(iso(10 * 60_000), NOW)).toBe('stale');
    expect(freshness(iso(2 * 3600_000), NOW)).toBe('unavailable');
    expect(freshness(null, NOW)).toBe('unavailable');
  });
});

describe('ago', () => {
  it('formats human ages', () => {
    expect(ago(iso(5_000), NOW)).toBe('just now');
    expect(ago(iso(3 * 60_000), NOW)).toBe('3 min ago');
    expect(ago(iso(5 * 3600_000), NOW)).toBe('5 h ago');
    expect(ago(iso(3 * 86400_000), NOW)).toBe('3 d ago');
  });
});

describe('cluster', () => {
  const pts = [
    { id: 'a', lat: 28.6139, lng: 77.209 },
    { id: 'b', lat: 28.6141, lng: 77.2092 }, // ~30 m from a
    { id: 'c', lat: 19.076, lng: 72.8777 }, // Mumbai
  ];
  it('merges nearby friends when zoomed out and splits them when zoomed in', () => {
    expect(cluster(pts, 4).map((c) => c.members.length).sort()).toEqual([1, 2]);
    expect(cluster(pts, 19)).toHaveLength(3);
  });
  it('keeps every friend exactly once', () => {
    const ids = cluster(pts, 4).flatMap((c) => c.members.map((m) => m.id));
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
  });
});
