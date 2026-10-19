# Privacy data map

| Data | Collected when | Purpose | Who can access | Stored where | Retention | On account deletion |
|---|---|---|---|---|---|---|
| Email | Sign-up / Google | Login, codes, security notices | User; service operators | `users` | Life of account | Deleted |
| Password hash (argon2id) | Sign-up / reset | Authentication | Nobody (one-way) | `users` | Life of account | Deleted |
| Google account id (`sub`) | Google sign-in | Authentication | Service | `users` | Life of account | Deleted |
| Username, display name, bio, avatar | Profile setup | Discovery, display | Signed-in users except blocked | `users`, media disk | Until changed | Deleted (avatar file unlinked) |
| Presence / last active | While app connected | Show online status | Friends, only if `showPresence` | memory, `users.lastActiveAt` | Overwritten | Deleted |
| Friend requests, friendships, blocks | User actions | Social graph, authorization | Parties involved | DB | Until changed | Deleted |
| Location settings, grants | User choice | Sharing policy | User | DB | Until changed | Deleted |
| **Current location** (lat, lng, accuracy, captured/received time) | Only while sharing is active | Show on friends' map | Authorized friends | `current_locations` (1 row) | Deleted on stop/ghost/expiry, max **24 h** | Deleted |
| Photos (re-encoded, no EXIF) + captions | User sends | Private sharing | Sender + chosen recipients | media disk + DB | Until the sender deletes (recipients may hide) | Sender's photos deleted; recipients lose access |
| Chat messages | User sends | Messaging | **End-to-end encrypted**: only the two devices | Ciphertext in DB until delivered; plaintext only in the device's SQLCipher DB | Server: until ack, max **30 days** | Pending ciphertext deleted |
| Chat attachments | User sends | Messaging | E2EE (key inside the message) | Ciphertext blob on disk | Max 30 days | Deleted |
| Public encryption keys | First sign-in per install | Start E2EE sessions | Friends (bundle fetch) | `devices`, `one_time_prekeys` | Until replaced | Deleted |
| Sessions (device name, timestamps), push token | Login | Security, notifications | User | `sessions` | Expired/revoked sessions purged after 30 days | Deleted |
| Audit events (type, time, IP) | Security events | Abuse and takeover detection | Operators | `audit_events` | **90 days** | User's events deleted; one anonymous "account.deleted" kept |
| Reports | User reports | Moderation | Operators | `reports` | Until resolved + kept for records | Reports *about* the user deleted; reports *by* them anonymized |
| Request logs (method, path, status; no query strings or bodies) | Every request | Operations | Operators | journald / nginx logs | Rotated (journald/logrotate defaults) | Not linked to user id |
| Encrypted backups (DB + media) | Nightly | Disaster recovery | Holder of the offline age key | `/var/backups/vybe` | **14 days** | Deleted data disappears from backups as they roll off |

**Third parties:** Oracle Cloud (hosting), the SMTP provider (email codes), Google (sign-in, if used), Firebase Cloud Messaging (generic push: category + ids, never content), OpenFreeMap tiles (map tile requests reveal the viewed area and IP to the tile server).

**Not collected:** location history, contacts, microphone, advertising ids, analytics SDKs.
