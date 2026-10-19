# Vybe API (v1)

Base: `https://<PUBLIC_HOST>/v1`. JSON in/out. Auth: `Authorization: Bearer <accessToken>` (15-minute JWT bound to a live session). Errors: `{ "error": { "code": "SNAKE_CASE", "message": "..." } }` with no stack traces. Validation errors return `400 VALIDATION_ERROR`. Rate limits return `429 RATE_LIMITED`. Unauthorized access to another user's objects returns **404**, not 403, so IDs can't be probed. Source of truth: the zod schemas in `apps/server/src/modules/*/routes.ts`.

Health: `GET /health` (process up), `GET /ready` (DB reachable). Both are unauthenticated and sit outside `/v1`.

## Auth `/auth`
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{email, password(10–128)}` | Always `202`. Sends a 6-digit code; an existing email gets a notice instead (no enumeration). |
| POST | `/auth/verify-email` | `{email, code, deviceName?}` | → `{accessToken, refreshToken, expiresIn}`. Max 5 attempts per code, 15-minute TTL. |
| POST | `/auth/resend-verification` | `{email}` | `202` |
| POST | `/auth/login` | `{email, password, deviceName?}` | `401 INVALID_CREDENTIALS` (same for unknown email, constant-time), `403 EMAIL_NOT_VERIFIED` |
| POST | `/auth/google` | `{idToken, deviceName?}` | Server verifies signature, issuer, audience (`GOOGLE_CLIENT_IDS`), expiry and `email_verified`. `404` if not configured. |
| POST | `/auth/refresh` | `{refreshToken}` | Rotates. Replaying a used token → `401 REFRESH_REUSED` and the session is revoked. |
| POST | `/auth/forgot-password` | `{email}` | Always `202` |
| POST | `/auth/reset-password` | `{email, code, newPassword}` | Revokes **all** sessions |
| POST | `/auth/logout` 🔒 | — | Revokes this session and closes its sockets |
| POST | `/auth/change-password` 🔒 | `{currentPassword, newPassword}` | Revokes other sessions |
| GET | `/auth/sessions` 🔒 | — | `{sessions:[{id, deviceName, createdAt, lastUsedAt, current}]}` |
| DELETE | `/auth/sessions/:id` 🔒 | — | Revoke one session |

## Me & users 🔒
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Profile, email, `hasPassword`, `hasGoogle` |
| PATCH | `/me` | `{username?, displayName?, bio?, avatarMediaId?, avatarStyle?, showPresence?}` (strict: unknown fields rejected). `avatarStyle` is `{skin, face, hair, hairColor, eyes, mouth, accessory, outfit}` as integer part indexes (range-checked) or `null`. `409 USERNAME_TAKEN` |
| PUT | `/me/mood` | `{emoji, text?}`: exactly one emoji, text ≤ 40. Friends see it for 24 h (`mood` on `/friends`, `/locations/friends`, `/users/:id` when friends); never in search. Emits `friend:mood` to friends. |
| DELETE | `/me/mood` | Clears it |
| GET | `/username-available?username=` | |
| PUT | `/me/push-token` | `{token \| null}`. Bound to this session. |
| GET/PUT | `/me/notifications` | `{friendRequests, photos, messages, security}` |
| GET | `/me/mutes` · PUT/DELETE `/me/mutes/:peerId` | `{until \| null}` (suppresses message push) |
| GET | `/users/search?q=` | Username prefix, ≥3 chars, 20 results, 30/min. Excludes blocks both ways. Returns `relationship`. |
| GET | `/users/:id` | `404` if blocked either way |
| GET | `/me/export` | JSON copy of the server-side data about you |
| DELETE | `/me` | `{password}` or `{googleIdToken}` re-auth. Deletes the account (see PRIVACY_DATA_MAP). |

## Friends & blocks 🔒
| Method | Path | Notes |
|---|---|---|
| GET | `/friends` | Accepted, unblocked friends with presence (if they allow it) |
| GET | `/friends/requests` | `{incoming, outgoing}` |
| POST | `/friends/requests` | `{userId}`. `201 created`, `200 pending` (duplicate), `200 accepted` (they had asked you), `409 ALREADY_FRIENDS`, `404` if blocked/unknown. 40/hour. |
| POST | `/friends/requests/:id/accept` · `/reject` | Recipient only |
| DELETE | `/friends/requests/:id` | Sender cancels |
| DELETE | `/friends/:userId` | Unfriend: removes grants and pending ciphertext between you |
| GET/POST | `/blocks` | POST `{userId}`: also unfriends and removes requests, grants and pending messages |
| DELETE | `/blocks/:userId` | |

## Location 🔒
| Method | Path | Notes |
|---|---|---|
| GET | `/locations/settings` | `{mode: OFF\|ALL\|SELECTED, ghost, expiresAt, active, grants[]}` |
| PUT | `/locations/settings` | Partial. `expiresAt` must be within 7 days. Grants are filtered to current friends. Turning sharing inactive **deletes** the stored point. |
| POST | `/locations` | `{lat, lng, accuracy?, capturedAt}`. `409 SHARING_OFF` when inactive, `400` if `capturedAt` is >15 min old or >1 min ahead, `429` if <20 s since the last upload. The server sets `receivedAt`. |
| DELETE | `/locations/me` | Delete the current point now |
| GET | `/locations/friends` | `{friends:[{user, sharing, location \| null}]}`. A location is returned only if the policy allows it now and it is <24 h old. |

## Media & photos 🔒
| Method | Path | Notes |
|---|---|---|
| POST | `/media` | multipart `file`, `kind=PHOTO\|AVATAR\|CHAT_BLOB`, `audienceUserId` (CHAT_BLOB, must be a friend). Images: ≤12 MB, decoded and re-encoded to JPEG (EXIF stripped). Blobs: ≤16 MB of opaque ciphertext. |
| GET | `/media/:id` | Streams bytes only to authorized viewers (`Cache-Control: private`) |
| POST | `/photos` | `{mediaId, caption?, recipientIds[1..50]}`. All recipients must be current friends. |
| GET | `/photos/inbox?cursor=` · `/photos/sent?cursor=` | 30 per page, cursor = ISO time |
| GET | `/photos/:id` · POST `/photos/:id/viewed` | |
| DELETE | `/photos/:id` | Sender: delete for everyone (the file is removed). Recipient: remove from their inbox. |

## E2EE keys & messages 🔒
| Method | Path | Notes |
|---|---|---|
| PUT | `/keys/device` | `{registrationId, identityKey, signedPreKey, kyberPreKey, preKeys[], kyberPreKeys[]}` (public keys, base64). Replacing the identity drops pending ciphertext and emits `keys:changed`. |
| POST | `/keys/prekeys` | Replenish one-time keys and/or rotate the signed prekey |
| GET | `/keys/count` | `{registered, registrationId, ec, kyber}` |
| GET | `/keys/bundle/:userId` | Friends only. Atomically consumes one EC + one Kyber one-time key (falls back to the last-resort Kyber key). |
| GET | `/keys/identity/:userId` | For safety numbers |
| POST | `/messages` | `{clientMsgId, recipientId, recipientRegistrationId, type: 2\|3, body(base64 ≤64 KB)}`. `403 CANNOT_MESSAGE`, `409 STALE_DEVICE`. Idempotent. |
| GET | `/messages/pending` | Up to 500, oldest first |
| POST | `/messages/ack` | `{ids[]}`. Deletes the acked ciphertext and notifies the sender. |

## Reports & admin 🔒
`POST /reports {targetUserId, photoPostId?, reason, details?}` (20/hour; you can only report photos you could see). Admin only: `GET /admin/reports?status=`, `POST /admin/reports/:id/resolve {action: NONE|REMOVE_PHOTO|SUSPEND, note?}`.

## WebSocket `/ws`
Connect with an `Authorization: Bearer` header. Failed auth → HTTP 401. The socket closes with code `4001` when the access token expires or the session is revoked; reconnect after refreshing. Ping every 30 s.

Server → client: `hello`, `location:update`, `location:removed`, `message:new`, `message:delivered`, `typing`, `presence`, `friend:request`, `friend:accepted`, `friend:removed`, `photo:new`, `keys:changed`, `error`.
Client → server: `{type:'typing', data:{to, on}}` (friends only, max 1/s), `{type:'ping'}`. There are no client-chosen subscriptions: the server only pushes events the user is authorized to receive.
