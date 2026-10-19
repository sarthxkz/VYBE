import { execSync } from 'node:child_process';
import pg from 'pg';

/** Creates the test database if needed and applies all migrations to it. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgresql://vybe:vybe_dev_password@localhost:5432/vybe_test');
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error(`Refusing to use non-test database "${name}"`);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
}
