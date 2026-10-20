import { hotspots } from '../hotspots';

const at = (id: string, dLatM: number) => ({ id, lat: 28.6139 + dLatM / 111_320, lng: 77.209 });

test('friends close together form one hotspot; lone friends do not', () => {
  const h = hotspots([at('a', 0), at('b', 120), at('c', 250), at('far', 5000)]);
  expect(h).toHaveLength(1);
  expect(h[0]!.count).toBe(3);
  expect(hotspots([at('a', 0), at('b', 1000)])).toHaveLength(0);
});
