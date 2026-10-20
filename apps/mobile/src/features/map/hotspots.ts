import { distanceM } from '@/features/location/nearby';

export type Hotspot = { id: string; lat: number; lng: number; count: number };

/** Groups friends within `radiusM` of each other; any group of 2+ is a hotspot. Small n (friends), so O(n²) is fine. */
export function hotspots(points: { id: string; lat: number; lng: number }[], radiusM = 300): Hotspot[] {
  const seen = new Set<string>();
  const out: Hotspot[] = [];
  for (const p of points) {
    if (seen.has(p.id)) continue;
    const group = points.filter((q) => !seen.has(q.id) && distanceM(p, q) <= radiusM);
    if (group.length < 2) continue;
    for (const g of group) seen.add(g.id);
    out.push({
      id: `hot-${group.map((g) => g.id).sort().join('-')}`,
      lat: group.reduce((s, g) => s + g.lat, 0) / group.length,
      lng: group.reduce((s, g) => s + g.lng, 0) / group.length,
      count: group.length,
    });
  }
  return out;
}
