// Grants admin access for the web panel at /admin. Run on the server, never over the API:
//   docker compose exec vybe-api node dist/cli/make-admin.js you@example.com [--new-password]
// Existing account: promoted to ADMIN, password unchanged unless --new-password is given.
// New email: a verified ADMIN account is created with a random password, printed once and stored only as a hash.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { hashPassword, revokeAllSessions } from '../lib/auth.js';

async function main() {
  const args = process.argv.slice(2);
  const email = z.email().safeParse(args.find((a) => !a.startsWith('--'))?.trim().toLowerCase());
  if (!email.success) {
    console.error('Usage: node dist/cli/make-admin.js <email> [--new-password]');
    process.exit(2);
  }
  const resetPassword = args.includes('--new-password');
  const password = randomBytes(18).toString('base64url'); // 24 characters, ~144 bits
  const existing = await db.user.findUnique({ where: { email: email.data } });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN', ...(resetPassword && { passwordHash: await hashPassword(password), emailVerifiedAt: existing.emailVerifiedAt ?? new Date() }) },
    });
    if (resetPassword) await revokeAllSessions(existing.id);
    await db.auditEvent.create({ data: { type: 'admin.granted', userId: existing.id, meta: { via: 'cli', passwordReset: resetPassword } } });
    console.log(`\n${email.data} is now an admin.`);
    console.log(resetPassword ? `New password: ${password}\n(All of this account's sessions were signed out.)\n` : 'Password unchanged. Sign in with the account’s current password.\n');
  } else {
    const user = await db.user.create({ data: { email: email.data, passwordHash: await hashPassword(password), emailVerifiedAt: new Date(), role: 'ADMIN' } });
    await db.auditEvent.create({ data: { type: 'admin.granted', userId: user.id, meta: { via: 'cli', created: true } } });
    console.log(`\nAdmin account created.\n  Email:    ${email.data}\n  Password: ${password}\n`);
  }
  console.log('Store the password in a password manager. It is not shown again and is stored only as a hash.');
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  await db.$disconnect();
  process.exit(1);
});
