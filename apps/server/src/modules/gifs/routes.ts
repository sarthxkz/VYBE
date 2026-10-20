import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { db } from '../../lib/db.js';
import { requireAuth, uid } from '../../lib/auth.js';
import { HttpError, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';

// GIF proxy for KLIPY or GIPHY. The phone never talks to the provider: searches and GIF bytes go through us, so
// the provider sees the server's IP, not users'. Search results' media links are stored under a short id; only
// that id travels inside the end-to-end encrypted chat message.
const GIF_ID = /^[A-Za-z0-9]{4,40}$/;
const ALLOWED_HOST = /(^|\.)(giphy\.com|klipy\.com)$/;
type Gif = { id: string; title: string; w: number; h: number; small: string; full: string };

const safeUrl = (u: unknown) => {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' && ALLOWED_HOST.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
};
const shortId = (prefix: string, raw: string) => (/^[A-Za-z0-9]{1,30}$/.test(raw) ? `${prefix}${raw}` : `${prefix}${createHash('sha256').update(raw).digest('hex').slice(0, 30)}`);

type KlipyFile = { url?: string; width?: number | string; height?: number | string };
type KlipyItem = { id?: string | number; slug?: string; title?: string; file?: Record<string, { gif?: KlipyFile }> };
async function klipy(q: string | undefined, page: number, customer: string): Promise<Gif[]> {
  const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(config.KLIPY_API_KEY!)}/gifs/${q ? 'search' : 'trending'}`);
  url.search = new URLSearchParams({ per_page: '24', page: String(page + 1), customer_id: customer, ...(q && { q }) }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new HttpError(502, 'GIFS_UNAVAILABLE', 'GIFS_UNAVAILABLE');
  const body = (await r.json()) as { data?: { data?: KlipyItem[] } };
  return (body.data?.data ?? []).flatMap((it) => {
    const f = it.file ?? {};
    const sm = f.sm?.gif ?? f.xs?.gif ?? f.md?.gif;
    const full = f.md?.gif ?? f.hd?.gif ?? sm;
    const small = safeUrl(sm?.url);
    const big = safeUrl(full?.url);
    if (!small || !big) return [];
    return [{ id: shortId('k', String(it.id ?? it.slug ?? small)), title: it.title ?? '', w: Number(sm?.width) || 200, h: Number(sm?.height) || 200, small, full: big }];
  });
}

type GiphyItem = { id: string; title?: string; images: { fixed_width: { url?: string; width: string; height: string }; downsized?: { url?: string } } };
async function giphy(q: string | undefined, page: number): Promise<Gif[]> {
  const url = new URL(q ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending');
  url.search = new URLSearchParams({ api_key: config.GIPHY_API_KEY!, limit: '24', offset: String(page * 24), rating: 'pg-13', ...(q && { q }) }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new HttpError(502, 'GIFS_UNAVAILABLE', 'GIFS_UNAVAILABLE');
  const body = (await r.json()) as { data: GiphyItem[] };
  return body.data.flatMap((g) => {
    if (!GIF_ID.test(g.id)) return [];
    const small = safeUrl(g.images.fixed_width.url) ?? `https://media.giphy.com/media/${g.id}/200w.gif`;
    const full = safeUrl(g.images.downsized?.url) ?? `https://media.giphy.com/media/${g.id}/giphy-downsized.gif`;
    return [{ id: g.id, title: g.title ?? '', w: Number(g.images.fixed_width.width) || 200, h: Number(g.images.fixed_width.height) || 200, small, full }];
  });
}

export const gifsRouter = Router();
gifsRouter.use(requireAuth);

gifsRouter.get('/gifs', rl.gifs, async (req, res) => {
  if (!config.KLIPY_API_KEY && !config.GIPHY_API_KEY) throw new HttpError(503, 'GIFS_NOT_CONFIGURED', 'GIFS_NOT_CONFIGURED');
  const { q, offset } = parse(z.object({ q: z.string().trim().max(50).optional(), offset: z.coerce.number().int().min(0).max(500).default(0) }), req.query);
  const page = Math.floor(offset / 24);
  // KLIPY wants a stable per-user id; give it a pseudonym, never our user id.
  const customer = createHash('sha256').update(`${config.JWT_SECRET}:gif:${uid(req)}`).digest('hex').slice(0, 32);
  const gifs = config.KLIPY_API_KEY ? await klipy(q || undefined, page, customer) : await giphy(q || undefined, page);
  if (gifs.length) {
    await db.$transaction(gifs.map((g) => db.gifMedia.upsert({ where: { id: g.id }, create: { id: g.id, small: g.small, full: g.full }, update: { small: g.small, full: g.full } })));
  }
  res.set('Cache-Control', 'private, max-age=300').json({ gifs: gifs.map(({ id, title, w, h }) => ({ id, title, w, h })) });
});

gifsRouter.get('/gifs/:id/:variant', rl.gifs, async (req, res) => {
  const id = parse(z.string().regex(GIF_ID), req.params.id);
  const variant = parse(z.enum(['small', 'full']), req.params.variant);
  const stored = await db.gifMedia.findUnique({ where: { id } });
  // GIFs sent before media links were stored are GIPHY ids; their URLs follow a fixed pattern.
  const target = stored ? safeUrl(stored[variant]) : `https://media.giphy.com/media/${id}/${variant === 'small' ? '200w.gif' : 'giphy-downsized.gif'}`;
  if (!target) throw notFound();
  const r = await fetch(target, { signal: AbortSignal.timeout(10000), redirect: 'error' }); // never follow off the allow-list
  if (!r.ok || !r.body) throw notFound();
  res.set({ 'Content-Type': r.headers.get('content-type')?.startsWith('image/') ? r.headers.get('content-type')! : 'image/gif', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  Readable.fromWeb(r.body as import('node:stream/web').ReadableStream).pipe(res);
});
