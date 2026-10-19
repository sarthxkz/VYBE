# Database

PostgreSQL 17, schema in [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma), migrations in `apps/server/prisma/migrations` (Prisma Migrate). UUID primary keys everywhere.

## Tables (and why each exists)
| Table | Purpose | Key constraints / indexes |
|---|---|---|
| `users` | Account + profile (merged: always 1:1) | unique `email`, `username`, `googleSub`, `avatarMediaId` |
| `sessions` | One login on one install; holds the push token so logout stops pushes | idx `userId`; unique `pushToken` |
| `refresh_tokens` | SHA-256 of every issued refresh token; `usedAt` enables reuse detection | unique `tokenHash` |
| `email_tokens` | Hashed 6-digit verify/reset codes with attempt counter | idx `(userId, purpose)` |
| `devices` | The single E2EE device per user: registration id, identity key, signed prekey, last-resort Kyber key | unique `userId` |
| `one_time_prekeys` | EC and Kyber one-time prekeys; deleted when handed out | unique `(deviceId, kind, keyId)` |
| `friend_requests` | Pending requests | unique `pairKey` = `min(id):max(id)`, so at most one per pair (race-safe) |
| `friendships` | Accepted pairs stored once with `userAId < userBId` | PK `(userAId, userBId)`, idx `userBId` |
| `blocked_users` | Directed blocks | PK `(blockerId, blockedId)`, idx `blockedId` |
| `location_sharing_settings` | mode OFF/ALL/SELECTED, ghost, temporary `expiresAt` | PK `userId` |
| `location_sharing_grants` | Viewers for SELECTED mode | PK `(ownerId, viewerId)` |
| `current_locations` | **Latest point only**, no history | PK `userId`, idx `receivedAt` |
| `media_objects` | Metadata for files in `MEDIA_DIR/<id>` | idx `ownerId` |
| `photo_posts`, `photo_recipients` | Explicit audience per photo | unique `mediaId`; idx `(recipientId, createdAt)` for inbox paging |
| `encrypted_messages` | Ciphertext awaiting delivery only | unique `(senderId, clientMsgId)` (idempotency); idx `(recipientId, createdAt)` |
| `chat_mutes` | Mute without leaking content | PK `(userId, peerId)` |
| `notification_preferences` | Push categories | PK `userId` |
| `reports`, `moderation_actions` | Abuse handling | idx `(status, createdAt)` |
| `audit_events` | Security events (no FK, so an account-deletion record survives) | idx `(userId, createdAt)`, `createdAt` |

Deviations from the original table list, on purpose: `user_profiles` was merged into `users`; `device_push_tokens` became `sessions.pushToken`; `conversations`/`conversation_members` aren't needed for 1:1 store-and-forward (conversation state lives on the device); `message_delivery_receipts` became encrypted control messages; `account_deletion_requests` isn't needed because deletion is immediate and audited.

## Deletion behavior
Deleting a user cascades to sessions, tokens, device keys, requests, friendships, blocks, location data, media rows, photo posts and recipients, pending messages, mutes and prefs. Reports *filed by* the user keep the report with `reporterId = NULL`. Media files are unlinked after the transaction commits, so a crash can leave an orphan file but never a dangling row; the cleanup job also removes orphan rows.

## Transactions & races
- Friend requests: an interactive transaction plus the `pairKey` unique constraint; a lost race (`P2002`) is retried once and sees the winner.
- Prekey claims: `DELETE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`, so concurrent fetchers never share a key.
- Refresh rotation: a conditional `updateMany(usedAt IS NULL)` so only one concurrent refresh wins.

## Migrations
- Dev: `npm run db:migrate -w apps/server` (creates and applies).
- Prod: `prisma migrate deploy`, run by `deploy/deploy.sh` **after** a fresh backup.
- Policy: migrations are additive (new columns nullable or with defaults; renames as add → backfill → switch → drop in a later release), so rolling the app back one release never needs a down-migration. A destructive migration needs an explicit restore plan in its PR.
- `prisma/seed.ts` is not provided: tests create their own data, and production never gets fake users.

## Backups
See [BACKUP_RESTORE.md](BACKUP_RESTORE.md).
