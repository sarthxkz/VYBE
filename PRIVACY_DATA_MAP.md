# Privacy data map

| Data | Collected when | Purpose | Who can access | Stored where | Retention | On account deletion |
|---|---|---|---|---|---|---|
| Email | Sign-up / Google | Login, codes, security notices | User; service operators | `users` | Life of account | Deleted |
| Password hash (argon2id) | Sign-up / reset | Authentication | Nobody (one-way) | `users` | Life of account | Deleted |
| Google account id (`sub`) | Google sign-in | Authentication | Service | `users` | Life of account | Deleted |
| Username, display name, bio, avatar | Profile setup | Discovery, display | Signed-in users except blocked | `users`, media disk | Until changed | Deleted (avatar file unlinked) |
| Illustrated avatar style (part indexes) | User designs it | Display | Signed-in users except blocked | `users.avatarStyle` | Until changed | Deleted |
| Mood (one emoji + up to 40 characters) | User sets it | Show friends your vibe | **Friends only**; hidden after 24 h | `users.mood*` | Overwritten or cleared; hidden after 24 h | Deleted |
| Contacts | **Not collected.** Read on the phone only when you choose to invite someone | Pick who to text an invite | Nobody else | Never leaves the phone | n/a | n/a |
| "Friend nearby" alerts | While sharing location | Notify you when a friend you can already see is within 250 m | Only you; computed on your phone | Device file (`nearby.json`: friend ids, near/far, time) | Until uninstall | Removed with the app |
| Presence / last active | While app connected | Show online status | Friends, only if `showPresence` | memory, `users.lastActiveAt` | Overwritten | Deleted |
| Friend requests, friendships, blocks | User actions | Social graph, authorization | Parties involved | DB | Until changed | Deleted |
| Location settings, grants | User choice | Sharing policy | User | DB | Until changed | Deleted |
| **Current location** (lat, lng, accuracy, captured/received time) | Only while sharing is active | Show on friends' map | Authorized friends | `current_locations` (1 row) | Deleted on stop/ghost/expiry, max **24 h** | Deleted |
| Photos (re-encoded, no EXIF) + captions | User sends | Private sharing | Sender + chosen recipients | media disk + DB | Until the sender deletes (recipients may hide) | Sender's photos deleted; recipients lose access |
| Chat messages | User sends | Messaging | **End-to-end encrypted**: only the two devices | Ciphertext in DB until delivered; plaintext only in the device's SQLCipher DB | Server: until ack, max **30 days** | Pending ciphertext deleted |
| **Encrypted chat backup** (opt-in) | User turns on backup | Restore chats on a new phone or login | **Nobody but the user**: sealed on the phone with AES-256-GCM, key from the user's backup password (PBKDF2-SHA256, 600k); the server holds ciphertext + public salt | `chat_backups` (1 row) | Until replaced, turned off, or the account is deleted | Deleted |
| Chat images (end-to-end encrypted blobs) | User sends an image in chat | Show it to the friend, and after a restore | The two friends (key is inside the E2EE message) | media disk | Until the sender's account is deleted | Deleted |
| Instant photos ("Blinks") | User sends an Instant | View-once photo | Sender + chosen friends, each once | media disk + DB | Deleted once every recipient opened it (2-min grace) or after **24 h** | Deleted |
| **Stories** (re-encoded photo, no EXIF, optional caption) | User shares to their story | Show friends a moment for a day | Owner + current friends (no block either way) | media disk + `stories` | Deleted **24 h** after posting, or when the owner deletes it | Deleted |
| Story views (who watched, when) | A friend opens a story | Let the owner see who watched | **The story's owner only** | `story_views` | Deleted with the story (24 h) | Deleted |
| Voice messages (end-to-end encrypted audio, length, loudness outline) | User holds the mic in a chat | Messaging | The two friends (key and outline are inside the E2EE message); the server stores only ciphertext | media disk; plaintext only in the phone's cache | Like chat images | Deleted |
| Microphone | **Only while the user holds the record button** in a chat | Recording a voice message | Nobody: recorded on the phone, encrypted before upload | Temporary file, deleted after upload | Seconds | n/a |
| Chat attachments | User sends | Messaging | E2EE (key inside the message) | Ciphertext blob on disk | Max 30 days | Deleted |
| Public encryption keys | First sign-in per install | Start E2EE sessions | Friends (bundle fetch) | `devices`, `one_time_prekeys` | Until replaced | Deleted |
| Sessions (device name, timestamps), push token | Login | Security, notifications | User | `sessions` | Expired/revoked sessions purged after 30 days | Deleted |
| Admin panel statistics | An admin opens /admin | Operating the service | Admins | Computed on request; crash summaries in memory | Not stored (crash list cleared on restart) | Counts only, never per-user data |
| Audit events (type, time, IP) | Security events | Abuse and takeover detection | Operators | `audit_events` | **90 days** | User's events deleted; one anonymous "account.deleted" kept |
| Reports | User reports | Moderation | Operators | `reports` | Until resolved + kept for records | Reports *about* the user deleted; reports *by* them anonymized |
| Request logs (method, path, status; no query strings or bodies) | Every request | Operations | Operators | Docker container logs | Rotated: 3 × 10 MB per container | Not linked to user id |
| Encrypted backups (DB + media) | Nightly | Disaster recovery | Holder of the offline age key | `/var/backups/vybe` | **14 days** | Deleted data disappears from backups as they roll off |

**Third parties:** Oracle Cloud (hosting), the SMTP provider (email codes), Google (sign-in, if used), Firebase Cloud Messaging (generic push: category + ids, never content), OpenFreeMap tiles (map tile requests reveal the viewed area and IP to the tile server).

**Not collected:** location history, contacts, microphone, advertising ids, analytics SDKs.
