import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { db } from './lib/db.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { rl } from './lib/rateLimit.js';
import { authRouter } from './modules/auth/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { friendsRouter } from './modules/friends/routes.js';
import { locationsRouter } from './modules/locations/routes.js';
import { mediaRouter } from './modules/media/routes.js';
import { photosRouter } from './modules/photos/routes.js';
import { keysRouter } from './modules/keys/routes.js';
import { messagesRouter } from './modules/messages/routes.js';
import { privacyRouter } from './modules/privacy/routes.js';
import { adminRouter, reportsRouter } from './modules/reports/routes.js';
import { telemetryRouter } from './modules/telemetry/routes.js';
import { backupRouter } from './modules/backup/routes.js';
import { gifsRouter } from './modules/gifs/routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  // API only, consumed by the native app: no CORS headers, so browsers cannot call it cross-origin.
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Never log query strings (search terms) or bodies.
      serializers: { req: (r) => ({ id: r.id, method: r.method, url: r.url?.split('?')[0] }) },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/ready', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use(rl.global);
  app.use(express.json({ limit: '1mb' }));

  const v1 = express.Router();
  v1.use('/auth', authRouter);
  v1.use(telemetryRouter); // before the routers that require auth for everything they see
  for (const r of [backupRouter, gifsRouter, usersRouter, friendsRouter, locationsRouter, mediaRouter, photosRouter, keysRouter, messagesRouter, privacyRouter, reportsRouter, adminRouter])
    v1.use(r);
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
