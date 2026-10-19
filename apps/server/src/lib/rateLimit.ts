import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../config.js';

// shortcut: in-memory store, valid only while the API runs as a single process; move to a Redis store before scaling out.
export const limits = { enabled: config.NODE_ENV !== 'test' };

const handler = (_req: Request, res: import('express').Response) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } });

const make = (windowMs: number, limit: number, key: 'ip' | 'user' | ((req: Request) => string)) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !limits.enabled,
    handler,
    keyGenerator:
      key === 'ip'
        ? (req) => ipKeyGenerator(req.ip ?? '')
        : key === 'user'
          ? (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? '')
          : key,
  });

const emailKey = (req: Request) => `e:${String(req.body?.email ?? '').toLowerCase()}`;

export const rl = {
  global: make(60_000, 300, 'ip'),
  authIp: make(15 * 60_000, 30, 'ip'),
  authEmail: make(15 * 60_000, 10, emailKey),
  codeEmail: make(60 * 60_000, 5, emailKey),
  search: make(60_000, 30, 'user'),
  friendRequest: make(60 * 60_000, 40, 'user'),
  upload: make(60 * 60_000, 120, 'user'),
  keyBundle: make(60 * 60_000, 200, 'user'),
  message: make(60_000, 120, 'user'),
  report: make(60 * 60_000, 20, 'user'),
  clientError: make(60_000, 10, 'ip'),
};
