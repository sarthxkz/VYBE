import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('../../.env');
} catch {}

const testDb = process.env.TEST_DATABASE_URL ?? 'postgresql://vybe:vybe_dev_password@localhost:5432/vybe_test';

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDb,
      MEDIA_DIR: mkdtempSync(path.join(tmpdir(), 'vybe-media-')),
      PUBLIC_URL: 'http://localhost:3000',
      JWT_SECRET: 'test-secret-test-secret-test-secret-0123456789',
      TRUST_PROXY: '0',
      GOOGLE_CLIENT_IDS: '',
      FCM_SERVICE_ACCOUNT_PATH: '',
    },
  },
});
