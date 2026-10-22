import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { rl } from '../../lib/rateLimit.js';

// Crash reports from the app's error screen, so release-build failures ("blank screen") are visible in the logs.
// No auth on purpose (crashes happen on sign-in screens too); small, rate-limited, length-capped, no user content.
export const telemetryRouter = Router();

/** The latest crash reports, newest first, for the admin panel. In memory only: lost on restart, never persisted. */
export const recentClientErrors: { at: string; message: string; path?: string; version?: string; updateId?: string }[] = [];

telemetryRouter.post('/client-errors', rl.clientError, (req, res) => {
  const body = parse(
    z
      .object({
        message: z.string().max(500),
        stack: z.string().max(4000).optional(),
        path: z.string().max(200).optional(),
        version: z.string().max(40).optional(),
        updateId: z.string().max(64).optional(),
      })
      .strict(),
    req.body,
  );
  logger.warn({ clientError: body }, 'client error');
  const { stack: _stack, ...summary } = body;
  recentClientErrors.unshift({ at: new Date().toISOString(), ...summary });
  recentClientErrors.length = Math.min(recentClientErrors.length, 50);
  res.status(204).end();
});
