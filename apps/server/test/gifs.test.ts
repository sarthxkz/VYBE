import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, makeUser, resetDb } from './helpers.js';
import { config } from '../src/config.js';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
  config.GIPHY_API_KEY = undefined;
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
