import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code = 'BAD_REQUEST', msg?: string) => new HttpError(400, code, msg);
export const unauthorized = (code = 'UNAUTHORIZED') => new HttpError(401, code);
export const forbidden = (code = 'FORBIDDEN') => new HttpError(403, code);
export const notFound = (code = 'NOT_FOUND') => new HttpError(404, code);
export const conflict = (code = 'CONFLICT', msg?: string) => new HttpError(409, code, msg);

/** Parse untrusted input or throw a 400 with field issues (no values echoed). */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // multer / body-parser errors carry a status; never leak internals.
  const status = typeof err?.status === 'number' && err.status < 500 ? err.status : 500;
  if (status === 500) logger.error({ err, reqId: req.id }, 'unhandled error');
  const code = err?.code === 'LIMIT_FILE_SIZE' || err?.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : status === 500 ? 'INTERNAL' : 'BAD_REQUEST';
  res.status(code === 'PAYLOAD_TOO_LARGE' ? 413 : status).json({ error: { code, message: status === 500 ? 'Something went wrong' : code } });
};
