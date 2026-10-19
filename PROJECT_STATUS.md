# Project status

_Last updated: 2026-10-19._ Legend: ✅ done and verified by automated tests or a build · 🟡 implemented, needs a physical device or credentials to verify · ⛔ blocked on you · ⬜ not started.

## Phase checklist
| # | Phase | Status | Evidence / notes |
|---|---|---|---|
| 1 | Foundation, design system, tooling | ✅ | Server: TS strict, ESLint, vitest. App: TS strict, ESLint (expo), jest-expo. Design tokens with AA-checked contrast, UI kit, brand icon and splash (`scripts/make-icons.mjs`). |
| 2 | Auth & onboarding | ✅ server · 🟡 app | 11 auth tests: enumeration-safe register/forgot, code lockout, refresh rotation + reuse revocation, instant logout, expired/forged JWT, reset revokes all sessions, session list/revoke. App screens built: intro, sign-up, verify, sign-in, forgot/reset, profile setup. |
| 2b | Google sign-in | ⛔ | Implemented on both sides (server verifies the ID token). Needs an OAuth client: `GOOGLE_CLIENT_IDS` + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + `google-services.json`. Not tested end to end. |
| 3 | Schema, friends, blocking | ✅ | 1 migration, 21 tables. Friend tests incl. concurrent opposite requests, block severs everything, search excludes blocked. |
| 4 | Map & location | ✅ server · 🟡 app | 10 location tests (non-friend, SELECTED grants, ghost deletes the row, block, temporary expiry, 24 h purge, validation, throttle, server-stamped time). App: MapLibre map, clustering (unit-tested), freshness from `receivedAt` (unit-tested), settings, two-step permission flow, foreground service at a 120 s target. **Real cadence under Doze is unverified.** |
| 5 | Camera & private photos | ✅ server · 🟡 app | 9 tests: EXIF stripped on the server, fake images rejected, size limits, recipient-only access, ID swap → 404, unauthenticated → 401, blocked sender hidden, sender delete removes the file. App: camera (flip/flash/preview/retake), gallery, client-side re-encode, upload progress, retry, feed, viewer, report. |
| 6 | E2EE chat | ✅ protocol via API · 🟡 Kotlin module | 8 tests incl. a **real libsignal PQXDH session through the API**, ciphertext-only storage, one-time-key single use under concurrency, idempotency, STALE_DEVICE, block/non-friend refusal. Kotlin module wraps libsignal-android 0.105.1 with a Keystore-encrypted state store; app has SQLCipher history, receipts, replies, typing, delete-for-everyone, encrypted images, safety numbers. **The Kotlin module compiles (see build) but hasn't been exercised on a device.** |
| 7 | Realtime & push | ✅ WS · ⛔ FCM | 4 WS tests (unauth/revoked rejected, location fan-out only to authorized viewers, typing to non-friend refused, logout closes the socket). FCM is wired up (generic payloads, mutes, prefs, token rotation) but **needs Firebase credentials**. |
| 8 | Privacy, legal, deletion | ✅ server · 🟡 app | Deletion test (re-auth, rows + files + sessions + audit removed, login fails afterwards); export endpoint. App: privacy dashboard, settings screens, blocked list, sessions, delete account. Legal pages are **drafts marked "pending legal review"**. |
| 9 | Oracle deploy | ✅ live · 🟡 backups | **Live at https://api.161-153-37-106.sslip.io** (2026-10-19): Docker Compose with its own Caddy on 80/443 (Bunkr and its backup removed from the VM at your request). Verified: migration applied (21 tables), `/ready` → `{"ok":true}` over HTTPS with a Let's Encrypt cert, HTTP → 308 to HTTPS, only Caddy publishes ports, 3000/5432 filtered from outside. SMTP via Gmail (`supportadmin.vybe@gmail.com`, app password, `deploy/set-smtp.sh`): login verified and a test email accepted by Gmail (250 OK). **Not yet:** backups (need your age key), host firewall review (sudo needs a password). |
| 10 | Security & QA | 🟡 | 54 server integration tests + 4 app unit tests. Log redaction, stack-trace and body-size tests. Pending: device E2E (Maestro), accessibility audit on device, external pentest. |

## Verified commands (2026-10-19)
- Server: `tsc --noEmit` ✅, `eslint` ✅, `vitest run` ✅ **54/54** (6 files, real Postgres 17), `tsc -p tsconfig.build.json` + boot + `/ready` ✅.
- App: `tsc --noEmit` ✅, `eslint` ✅ (0 errors), `jest` ✅ 4/4.
- Android `assembleDebug` (JDK 25 + Gradle 9.4.1 work): all Kotlin compiles, **including the `vybe-signal` module against libsignal-android 0.105.1** (compiled classes produced). The build then **fails at the C++ step on Windows**: ninja 1.10 (bundled with SDK CMake 3.22.1) can't stat the react-native-gesture-handler codegen object path (>260 chars), and `LongPathsEnabled=0` on this PC. `subst` and `CMAKE_OBJECT_PATH_MAX` didn't help. **No APK yet.** Fix options are listed under blockers.
- graphify (AST, 110 code files → 790 nodes, 37 communities): **no import cycles**; every resource route module imports both `requireAuth` and `authz.ts`. Report: `graphify-out/GRAPH_REPORT.md`.

## First release APK (2026-10-20)
- Built natively on Windows (long paths on, SDK CMake 4.1.2) in 40 min: `assembleRelease`, arm64-v8a, **signed with the private release key** (cert SHA-256 `9d5d4bff…46ee65ac`, verified with apksigner). Contains `libsignal_jni.so`, MapLibre, expo-sqlite (SQLCipher) and the Hermes bundle.
- Published: https://api.161-153-37-106.sslip.io/app/android/vybe-0.1.0-1.apk (`latest.json` versionCode 1). The download was verified from the VM (200, full 76 MB, correct content type).
- Self-hosted OTA (code-signed) and the in-app APK update prompt are built in. **Not yet exercised on a phone.**

## External blockers (need you)
| Blocker | Unblocks | What to provide |
|---|---|---|
| Firebase project | Push notifications, Google sign-in | `google-services.json`, service-account JSON, OAuth web client ID |
| age key pair | Encrypted backups | Public key in `~/.config/vybe/backup-recipients.txt` on the VM; private key kept offline |
| Physical Android phone (USB debugging) | Background location cadence, camera, FCM, Keystore, E2EE on device | — |
| Legal review | Public launch | Counsel review of Privacy Policy / Terms / Guidelines |
| Support inbox | In-app support link | `EXPO_PUBLIC_SUPPORT_EMAIL` |

## Known limitations (by design for v1)
- One E2EE device per account; reinstall = new identity and history stays on the old device.
- Photos are access-controlled, not end-to-end encrypted (chat images *are* E2EE).
- Rate limits, presence and the location throttle are per-process (fine for one API process).
- Android may deliver location less often than every 2 minutes; the UI shows the true age.
- No 2FA yet.

## Physical-device test checklist (to run once a phone is connected)
1. Fresh install → intro → sign up → code from Mailpit → profile setup.
2. Two accounts: friend request → accept → both maps show the friend card.
3. Turn on sharing (All) → foreground permission → background "Allow all the time" → the notification appears → leave the phone idle 30 min → check the friend's view shows updates (record actual intervals).
4. Ghost Mode → the friend's pin disappears within seconds.
5. Revoke the location permission in Android settings → the app shows the denied state; re-grant → recovers.
6. Camera: flip, flash, retake, send to 1 friend → the recipient sees it; a third account can't.
7. Chat: send/receive, kill the recipient app → send → reopen → message arrives; reply, delete-for-everyone, image, safety number matches on both phones.
8. Airplane mode → send a message → shows failed → back online → retry delivers.
9. Reinstall one side → the other side shows "safety number changed".
10. Delete account → can't sign in; the friend loses the card.
11. TalkBack pass over intro, sign-in, map, chat; large font scale; small (5") and large (6.7") screens.
