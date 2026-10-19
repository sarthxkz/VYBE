# Security

## Boundaries
- **Trust nothing from the client.** Identity comes only from a verified, session-bound JWT. Friendship, block, sharing and audience checks run server-side in `apps/server/src/lib/authz.ts`, which every route and socket handler calls.
- **The server never holds chat plaintext or private keys.** Only Signal ciphertext and public keys. See [ENCRYPTION_DESIGN.md](ENCRYPTION_DESIGN.md).
- **Private media is never public.** Files live outside any web root under random UUIDs and are streamed only by `GET /v1/media/:id` after `canViewMedia`.
- **Only 80/443 (and 22 from an admin IP) are reachable.** Postgres and the Node port bind to localhost.

## Threat model

| Threat | Mitigations | Residual risk |
|---|---|---|
| **Location stalking by non-friends** | Location returned only by `locationVisibleOwners` (friend ∧ ¬block ∧ sharing active ∧ (ALL ∨ grant)); 404-style responses; WS fan-out uses the same policy; tests cover non-friend, blocked, ungranted, ghost, expired. | A friend you allow can still see you — by design. Coarse-location mode is not implemented. |
| **Location stalking by an abusive friend / coerced sharing** | Ghost Mode deletes the point instantly; per-friend SELECTED mode; timers; block hides immediately; no history stored; persistent Android notification while sharing. | Social coercion can't be solved technically. |
| **Account takeover** | argon2id (OWASP params); constant-time unknown-email path; per-IP + per-email rate limits; 6-digit codes hashed, 5 attempts, 15-min TTL; refresh rotation with reuse detection that revokes the session and sends a security push (a replay within 30 s is refused but not treated as theft, because the app and the headless location task can legitimately race); password reset revokes all sessions; sessions list + remote revoke. | No 2FA yet. Email account compromise = Vybe account compromise. |
| **Token theft** | Access token 15 min, in memory only; refresh token in Keystore-backed SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); every request re-checks that the session is live, so logout/revoke is instant; WS closed on revoke/expiry. | Rooted device malware can read app memory. |
| **IDOR / broken object authorization** | Every object lookup filters by ownership or audience; unauthorized → 404; tests swap photo/media IDs and try other users' queues and acks. | — |
| **Private media URL leakage** | No public URLs; authz on every fetch; `Cache-Control: private`; chat media is ciphertext with the key only inside the Signal message. | Recipients can screenshot or save photos — stated in the UI and Terms. |
| **Malicious uploads** | 12/16 MB limits (Caddy + multer), image decode via sharp with pixel limit, re-encode to JPEG (drops EXIF/GPS and polyglots), server-generated file names, `nosniff`. | Image-decoder 0-days (keep sharp updated). |
| **Spam / abuse** | Rate limits on search, requests, messages, uploads, reports; blocks sever everything; reports + admin suspend. | Single-process in-memory limiter (see Redis note). |
| **Replay / duplicates** | `clientMsgId` idempotency; Signal's built-in duplicate detection; refresh tokens single-use; last-resort Kyber key base-key replay check on device. | — |
| **WebSocket abuse** | JWT on upgrade, 4 KB max frame, typing throttled 1/s and friend-only, no client-chosen subscriptions, heartbeat drops dead sockets. | — |
| **Device compromise** | Signal state encrypted under a non-exportable Android Keystore AES key in `noBackupFilesDir`; chat DB is SQLCipher with a Keystore-protected key; `allowBackup=false`. | An unlocked, rooted device exposes decrypted history. |
| **Server compromise** | Attacker gets metadata (who, when, friend graph, latest locations of sharers, photos) but not chat content or private keys. Backups are encrypted to an offline age key. | Photos are not E2EE (server-side private storage) — documented. |
| **Secrets in logs** | pino redaction of auth headers, passwords, tokens, ciphertext; URLs logged without query strings (app; Caddy keeps no access log); test asserts redaction. | — |
| **SQL injection** | Prisma parameterized queries; the two raw queries use tagged templates (parameterized). | — |
| **Dependency vulnerabilities** | `npm audit` in CI checklist; lockfiles committed; versions pinned to SDK-compatible ranges. | Transitive advisories in Expo tooling (dev-only). |

## Controls checklist
- HTTPS only (HSTS); release builds disable cleartext and require an `https://` API URL.
- `helmet` headers; no CORS (no browser clients); `x-powered-by` off; JSON body ≤1 MB.
- Errors: generic messages, no stack traces (tested).
- Audit events: register, login (ok/failed), refresh reuse, password reset/change, session revoke, block, keys registered/changed, ghost on/off, admin actions, account deleted. Retained 90 days.
- Least privilege: API runs as the unprivileged `node` user in its container; no published ports (only Caddy reaches it); Postgres on an internal-only network. shortcut: the DB role owns its database (Postgres image default) rather than a separate migration role; split roles if more services share the DB.

## Known gaps (tracked in PROJECT_STATUS.md)
- No 2FA, and no email notice on new-device sign-in.
- Photos are protected by access control, not end-to-end encryption.
- The rate limiter and presence are per-process.
- No external penetration test yet.

## Reporting a vulnerability
Contact the maintainers privately; please don't open a public issue.
