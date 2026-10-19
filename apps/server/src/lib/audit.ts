import type { Request } from 'express';
import { db } from './db.js';
import { logger } from './logger.js';

/** Records a security-relevant event. Never include secrets or content in `meta`. */
export function audit(type: string, userId: string | null, req?: Request, meta?: Record<string, string | number | boolean>) {
  db.auditEvent
    .create({ data: { type, userId, ip: req?.ip ?? null, meta } })
    .catch((err) => logger.error({ err, type }, 'audit write failed'));
}
