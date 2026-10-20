import { Readable } from 'node:stream';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { requireAuth } from '../../lib/auth.js';
import { HttpError, notFound, parse } from '../../lib/errors.js';
import { rl } from '../../lib/rateLimit.js';

// GIPHY proxy. The phone never talks to GIPHY directly: searches and GIF bytes go through us, so GIPHY sees
// the server's IP, not users'. The GIF id travels inside the end-to-end encrypted chat message.
const GIF_ID = /^[A-Za-z0-9]{4,40}$/;
const VARIANTS = { small: '200w.gif', full: 'giphy-downsized.gif' } as const;

type GiphyItem = { id: string; title?: string; images: { fixed_width: { width: string; height: string } } };
const toGif = (g: GiphyItem) => ({ id: g.id, title: g.title ?? '', w: Number(g.images.fixed_width.width) || 200, h: Number(g.images.fixed_width.height) || 200 });

export const gifsRouter = Router();
gifsRouter.use(requireAuth);

gifsRouter.get('/gifs', rl.gifs, async (req, res) => {
  if (!config.GIPHY_API_KEY) throw new HttpError(503, 'GIFS_NOT_CONFIGURED', 'GIFS_NOT_CONFIGURED');
  const { q, offset } = parse(z.object({ q: z.string().trim().max(50).optional(), offset: z.coerce.number().int().min(0).max(500).default(0) }), req.query);
  const url = new URL(q ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending');
  url.search = new URLSearchParams({ api_key: config.GIPHY_API_KEY, limit: '24', offset: String(offset), rating: 'pg-13', ...(q && { q }) }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new HttpError(502, 'GIFS_UNAVAILABLE', 'GIFS_UNAVAILABLE');
  const body = (await r.json()) as { data: GiphyItem[] };
  res.set('Cache-Control', 'private, max-age=300').json({ gifs: body.data.map(toGif) });
});

gifsRouter.get('/gifs/:id/:variant', rl.gifs, async (req, res) => {
  const id = parse(z.string().regex(GIF_ID), req.params.id);
  const variant = parse(z.enum(['small', 'full']), req.params.variant);
  const r = await fetch(`https://media.giphy.com/media/${id}/${VARIANTS[variant]}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok || !r.body) throw notFound();
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  Readable.fromWeb(r.body as import('node:stream/web').ReadableStream).pipe(res);
});
