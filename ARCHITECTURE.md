# Architecture

```
Android app (Expo dev build)
 ├─ expo-router screens ── TanStack Query ── api client (JWT + single-flight refresh)
 ├─ realtime client (WebSocket, Authorization header, backoff reconnect)
 ├─ location task (expo-location foreground service, 120 s target) ──► POST /v1/locations
 ├─ chat service ── vybe-signal (Kotlin, libsignal) ── keystore-encrypted state file
 │                └─ SQLCipher DB (decrypted history, key in SecureStore/Keystore)
 └─ FCM token ──► PUT /v1/me/push-token
          │ HTTPS / WSS (443)
          ▼
Caddy (TLS, shared with Bunkr on the VM, no access logs)
          │ 127.0.0.1:3000
          ▼
Express 5 API + ws (single Node process, Docker container)
 ├─ lib/auth.ts   argon2id, JWT(15 min, session-bound), rotating refresh tokens
 ├─ lib/authz.ts  the only place that decides friend/block/location/photo/media access
 ├─ modules/*     auth, users, friends, locations, media, photos, keys, messages, privacy, reports/admin
 ├─ realtime.ts   per-user socket registry, authorized fan-out, presence, typing
 └─ jobs.ts       retention: locations 24 h, undelivered ciphertext 30 d, orphan media, tokens, audit 90 d
          │
          ├─ PostgreSQL 17 (localhost only)
          └─ volume vybe_media (private files, served only via GET /v1/media/:id after authz)
```

## Key decisions (ADR summary)

| Decision | Why | Revisit when |
|---|---|---|
| **libsignal** for E2EE (user decision) | Reviewed, maintained Signal protocol incl. PQXDH (Kyber) and double ratchet. AGPL-3.0 → app is AGPL. | Never swap for custom crypto. |
| **One E2EE device per account** | Multi-device Signal needs sender-key fan-out and device lists; doing it wrong breaks the security model. Reinstall = new identity + safety-number change. | Multi-device is a product requirement. |
| **Server is store-and-forward only for chat** | Ciphertext is deleted on ack; read receipts/deletes are encrypted control messages, so the server never sees read state. | — |
| **No Redis** | One API process on one VM: rate limits, presence, upload throttle live in memory (`shortcut:` comments mark each). | Running >1 API process. |
| **No PostGIS** | Queries are "latest point of these friend IDs", never "users near X". | Proximity features. |
| **Media on VM disk** (user decision) | Fewest moving parts; covered by the same encrypted backup. Files are served only through an authz-checked endpoint, never a web root. | Multi-host or >~50 GB media → OCI Object Storage with presigned URLs. |
| **Express, not NestJS** | Smaller; one folder per module; `authz.ts` centralizes policy. | Team growth. |
| **MapLibre + OpenFreeMap** | No API key, no per-load billing; restyleable. | Need for traffic/places data. |
| **Hand-written API.md** instead of generated OpenAPI | Endpoint count is modest; zod schemas in code are the source of truth. | Public API consumers. |

## Data flow: location

1. User turns sharing on (mode ALL/SELECTED, optional expiry). Settings live server-side.
2. App asks foreground permission, then (separately, with an explanation) background permission.
3. Background: `startLocationUpdatesAsync` with a visible foreground-service notification, `timeInterval: 120000`. Foreground-only: `watchPositionAsync` while open.
4. Each fix → dedupe (≥90 s unless moved, ≥20 s hard floor) → `POST /locations` with bounded exponential backoff.
5. Server re-checks sharing is active, validates coordinates/timestamp/frequency, stamps `receivedAt`, upserts the single row, and pushes `location:update` only to `locationViewers(owner)`.
6. Friends' UI computes fresh (<5 min) / stale (<60 min) / unavailable from `receivedAt`, never from the requested interval.
7. Ghost Mode / off / expiry → row deleted immediately and `location:removed` sent; a 5-minute job enforces it too.

## Data flow: encrypted message

1. Sender without a session: `GET /keys/bundle/:friend` (consumes one EC + one Kyber one-time prekey atomically with `SKIP LOCKED`) → `processBundle` (verifies signatures).
2. `encrypt` in Kotlin → `POST /messages {clientMsgId, recipientRegistrationId, type, body}`. Idempotent on `(sender, clientMsgId)`. Mismatched registration id → `409 STALE_DEVICE` → sender refetches bundle once.
3. Server emits `message:new` (or FCM "New message" if offline, honoring mutes/prefs).
4. Recipient `GET /messages/pending` → decrypt → store in SQLCipher → `POST /messages/ack` → server deletes ciphertext and emits `message:delivered` to sender.
