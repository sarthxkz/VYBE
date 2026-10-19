export type Pt = { id: string; lat: number; lng: number };
export type Cluster<T extends Pt> = { id: string; lat: number; lng: number; members: T[] };

/**
 * Grid clustering in Web-Mercator pixel space: points closer than ~`radiusPx` at this zoom merge.
 * Plenty for friend counts (tens to low hundreds) and needs no native layer.
 */
export function cluster<T extends Pt>(points: T[], zoom: number, radiusPx = 56): Cluster<T>[] {
  const scale = 256 * 2 ** zoom;
  const px = (p: Pt) => {
    const x = ((p.lng + 180) / 360) * scale;
    const s = Math.sin((Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    return { x, y };
  };
  const cells = new Map<string, T[]>();
  for (const p of points) {
    const { x, y } = px(p);
    const key = `${Math.floor(x / radiusPx)}:${Math.floor(y / radiusPx)}`;
    cells.set(key, [...(cells.get(key) ?? []), p]);
  }
  return [...cells.values()].map((members) => ({
    id: members.map((m) => m.id).sort().join(','),
    lat: members.reduce((a, m) => a + m.lat, 0) / members.length,
    lng: members.reduce((a, m) => a + m.lng, 0) / members.length,
    members,
  }));
}
