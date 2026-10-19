import { defineConfig, env } from 'prisma/config';

// Local dev reads the repo-root .env; production gets real env vars from systemd.
try {
  process.loadEnvFile('../../.env');
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
