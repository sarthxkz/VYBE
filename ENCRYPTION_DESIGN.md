# End-to-end encryption design

## Protocol & library
- **Signal protocol** via Signal's official **libsignal 0.105.1**: `org.signal:libsignal-android` on the device (Kotlin module `apps/mobile/modules/vybe-signal`), `@signalapp/libsignal-client` in server **tests only**. No custom cryptography: Vybe only stores, transports and wires up libsignal objects.
- Session setup uses **PQXDH** (X25519 + Kyber-1024 prekeys) and messages use the **Double Ratchet** (forward secrecy and post-compromise security as provided by libsignal).
- License: AGPL-3.0-only, which makes the Vybe app AGPL.

## Keys (per device; v1 = one device per account)
| Key | Where the private part lives | What the server gets |
|---|---|---|
| Identity key pair (Curve25519) | Device only | Public identity key |
| Registration id | Device | Same |
| Signed prekey (rotated weekly, previous kept) | Device | Public key + signature |
| Last-resort Kyber prekey | Device | Public key + signature |
| One-time EC + Kyber prekeys (batches of 50, replenished below 15) | Device; deleted on use | Public keys; each deleted when handed out |
| Session / ratchet state | Device | Nothing |

**Device storage:** all protocol state is one JSON document encrypted with AES-256-GCM under a **non-exportable Android Keystore key** (`SecureStateFile.kt`), written atomically to `noBackupFilesDir`. Decrypted chat history lives in an **SQLCipher** database whose 256-bit raw key is in `expo-secure-store` (Keystore-backed, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`). `android:allowBackup=false`.

**JS boundary:** the native module never returns private keys or session state, only public keys, ciphertext and (on decrypt) the plaintext to display.

## Message flow
1. No session → `GET /keys/bundle/:peer` (friends only; consumes one-time keys atomically) → `SessionBuilder.process` verifies the signed-prekey and Kyber signatures against the identity key.
2. Payload (JSON) → `SessionCipher.encrypt` → `POST /messages` with `recipientRegistrationId`. A mismatch (peer reinstalled) → `409 STALE_DEVICE` → reset session, refetch bundle, retry once.
3. Payload types: `text`, `image`, `read` (receipts), `delete` (delete-for-everyone). **Receipts and deletes are themselves encrypted**, so the server never learns read state or which message was deleted. Receivers apply a `delete` only to the *sender's own* messages and a `read` only to messages sent to that peer.
4. Recipient decrypts, stores locally, acks; the server deletes the ciphertext immediately. Undelivered ciphertext expires after 30 days.

## Encrypted attachments
The image is re-encoded (EXIF stripped), encrypted on the device with a fresh **AES-256-GCM** key (`expo-crypto`), and the ciphertext is uploaded as a `CHAT_BLOB` that only the sender and the named friend may download. The key, media id and dimensions travel **inside** the Signal message. The server never sees the key; URLs contain only the random media id.

## Identity changes & verification
- Trust on first use. A changed identity key is **accepted but flagged** (`identityChanged`), and the chat shows "safety number changed". The server also emits `keys:changed` so peers drop old sessions.
- Users can compare a 60-digit **safety number** (`NumericFingerprintGenerator`, 5200 iterations, version 2) in person from the chat menu.
- Not implemented: blocking sends until re-verification (Signal's strict mode).

## Lifecycle
| Event | Behavior |
|---|---|
| First sign-in on an install | New identity registered (`PUT /keys/device`) |
| Sign-out | Local keys, sessions and chat DB are wiped |
| Reinstall / new phone | New identity; old history stays on the old device; friends see a safety-number change; pending ciphertext for the old identity is dropped |
| Multi-device | **Not supported** (one active device per account). Signing in elsewhere replaces the keys. |
| Account deletion | Server keys + pending ciphertext deleted; local state wiped |

## Metadata visible to the server
Sender and recipient ids, timestamps, ciphertext size and type (prekey vs. whisper) while the message is pending; who has a registered device; prekey fetch events; friend graph; typing events in transit (not stored); presence (if enabled). Push notifications contain only generic text plus a category.

## Testing
`apps/server/test/chat.test.ts` runs a real libsignal session between two clients through the HTTP API: it verifies decryption both ways, asserts the stored bytes don't contain the plaintext in raw or base64 form, checks one-time-key single use (including concurrency), STALE_DEVICE handling, and that blocked users and non-friends can't fetch bundles or send. The Kotlin module itself is **not yet exercised by automated tests on a device**; see PROJECT_STATUS.md.
