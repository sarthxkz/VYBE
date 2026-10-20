import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, makeUser, resetDb } from './helpers.js';
import { config } from '../src/config.js';
import { db } from '../src/lib/db.js';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
  config.GIPHY_API_KEY = undefined;
  config.KLIPY_API_KEY = undefined;
});

describe('GIF proxy', () => {
  it('is off without a key, and requires sign-in', async () => {
    const u = await makeUser();
    expect((await api().get('/v1/gifs').set(u.auth).expect(503)).body.error.code).toBe('GIFS_NOT_CONFIGURED');
    await api().get('/v1/gifs').expect(401);
  });

  it('searches through the server and returns only id + size', async () => {
    config.GIPHY_API_KEY = 'test-key';
    const giphy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'abc123', title: 'cat', images: { fixed_width: { width: '200', height: '150' } }, user: { secret: 1 } }] })),
    );
    const u = await makeUser();
    const r = await api().get('/v1/gifs?q=cat').set(u.auth).expect(200);
    expect(r.body).toEqual({ gifs: [{ id: 'abc123', title: 'cat', w: 200, h: 150 }] });
    const called = String(giphy.mock.calls[0]![0]);
    expect(called).toContain('api.giphy.com/v1/gifs/search');
    expect(called).toContain('q=cat');
  });

  it('only fetches whitelisted GIPHY media paths', async () => {
    const u = await makeUser();
    await api().get('/v1/gifs/..%2F..%2Fetc/small').set(u.auth).expect(400);
    await api().get('/v1/gifs/abc123/huge').set(u.auth).expect(400);
  });
});

describe('KLIPY', () => {
  it('searches with a pseudonymous customer id, stores media links, and proxies only allow-listed hosts', async () => {
    config.KLIPY_API_KEY = 'klipy-key';
    const item = { id: 987, title: 'wave', file: { sm: { gif: { url: 'https://static.klipy.com/a/sm.gif', width: 220, height: 160 } }, md: { gif: { url: 'https://static.klipy.com/a/md.gif' } } } };
    const evil = { id: 6, title: 'x', file: { sm: { gif: { url: 'http://169.254.169.254/latest' } } } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: { data: [item, evil] } })));
    const u = await makeUser();
    const r = await api().get('/v1/gifs?q=hi').set(u.auth).expect(200);
    expect(r.body.gifs).toEqual([{ id: 'k987', title: 'wave', w: 220, h: 160 }]);
    const called = String(fetchMock.mock.calls[0]![0]);
    expect(called).toContain('api.klipy.com/api/v1/klipy-key/gifs/search');
    expect(called).not.toContain(u.id);
    expect(await db.gifMedia.findUnique({ where: { id: 'k987' } })).toMatchObject({ full: 'https://static.klipy.com/a/md.gif' });

    fetchMock.mockResolvedValueOnce(new Response('GIF89a', { headers: { 'content-type': 'image/gif' } }));
    await api().get('/v1/gifs/k987/full').set(u.auth).expect(200);
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://static.klipy.com/a/md.gif');

    await db.gifMedia.create({ data: { id: 'kbad1', small: 'https://evil.example/x.gif', full: 'https://evil.example/x.gif' } });
    await api().get('/v1/gifs/kbad1/small').set(u.auth).expect(404);
  });
});
