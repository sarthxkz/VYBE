import { createServer } from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { startJobs } from './jobs.js';
import { db } from './lib/db.js';
import { logger } from './lib/logger.js';

const server = createServer(createApp());
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
const realtime = attachRealtime(server);
const stopJobs = startJobs();

server.listen(config.PORT, config.HOST, () => logger.info({ host: config.HOST, port: config.PORT }, 'vybe api listening'));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  stopJobs();
  realtime.close();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
