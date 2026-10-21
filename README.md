# Vybe

A private, Android-first social app: a live **friends map** with consent-based location sharing, **private photo sharing**, and **end-to-end encrypted chat** (Signal protocol).

| Part | Stack | Path |
|---|---|---|
| Android app | Expo SDK 58 (dev build), React Native 0.88, TypeScript, expo-router, TanStack Query, Zustand, MapLibre | `apps/mobile` |
| E2EE native module | Kotlin + `org.signal:libsignal-android` 0.105.1 | `apps/mobile/modules/vybe-signal` |
| API | Node 24, Express 5, Prisma 7, PostgreSQL 17, `ws` | `apps/server` |
| Ops | Docker Compose behind Caddy (auto TLS), age-encrypted backups, Oracle Cloud VM | `deploy/` |

Status of every feature, including what is **not** verified yet, is in [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Quick start (local)

Prerequisites: Node 24, Docker Desktop, Android SDK (platform 36), a JDK supported by Gradle 9.4 (17–25).

```bash
cp .env.example .env               # then set JWT_SECRET to a long random value
docker compose up -d               # Postgres 17 + Mailpit (http://localhost:8025 shows sent emails)
npm install                        # installs the server workspace
npm run db:migrate -w apps/server  # apply migrations
npm run dev:server                 # API on http://127.0.0.1:3000

cd apps/mobile
npm install
npx expo prebuild -p android
npx expo run:android               # builds the dev client and installs it on a device/emulator
```

**Windows:** React Native codegen paths exceed 260 characters. Enable long paths once (admin): `reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f`, and install SDK CMake 4.1.2 (`sdkmanager "cmake;4.1.2"`). The app is configured to use it (`plugins/withCmakeVersion.js`).

The emulator reaches your machine's API at `http://10.0.2.2:3000` (the default). For a physical phone, set `EXPO_PUBLIC_API_URL` to your machine's LAN address or the deployed HTTPS URL before building.

## Releases & updates (Android)

Two keys live **only on the release PC**, in `%USERPROFILE%\.vybe\`. Back up both, plus `%USERPROFILE%\.gradle\gradle.properties`, which holds the keystore password:
- `vybe-release.jks`: the APK signing key. Android installs an update only if it's signed with the same key, so if you lose it, every user must uninstall and reinstall.
- `ota-private-key.pem`: signs over-the-air updates. The app trusts only `apps/mobile/certs/ota-certificate.pem`, so a compromised server can't push code.

**JS / asset change** (most changes): phones download it in the background and run it on the next launch.
```bash
cd apps/mobile && node scripts/publish.mjs ota
```
**Native change** (new native module, permission, SDK upgrade, `app.config.ts` plugins): bump `VERSION` and `VERSION_CODE` in `app.config.ts`, build, then publish. The app shows "Update available" and downloads the APK from the server.
```bash
cd apps/mobile
APP_VARIANT=production EXPO_PUBLIC_API_URL=https://api.161-153-37-106.sslip.io npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
node scripts/publish.mjs apk
```
OTA updates only reach APKs with the same `VERSION` (runtime version), so JS that needs new native code never lands on an old APK. After publishing a new APK, publish OTA updates for the new version.

**Build failed with `package com.vybe does not exist`?** Gradle reused a stale autolinking cache. Delete `apps/mobile/android/build/generated/autolinking` and `apps/mobile/android/app/build/generated/autolinking`, then build again (the package is `app.vybe`).

## Tests

```bash
npm test                      # server: 54+ integration tests against a real Postgres (vybe_test DB)
npm run typecheck && npm run lint
cd apps/mobile && npm test && npx tsc --noEmit && npx eslint src modules
```

The server suite includes a full Signal session between two simulated devices through the real API, and checks that the database holds only ciphertext.

## Configuration

Server environment: [.env.example](.env.example). App build variables:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL. Required (https) for `APP_VARIANT=production` builds |
| `APP_VARIANT=production` | Disables cleartext HTTP, enforces https API URL |
| `GOOGLE_SERVICES_JSON` | Path to Firebase `google-services.json` (enables FCM push) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google OAuth web client ID (enables Google sign-in) |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | Support address shown in the app (hidden if unset) |

## Documentation

[ARCHITECTURE](ARCHITECTURE.md) · [API](API.md) · [DATABASE](DATABASE.md) · [SECURITY](SECURITY.md) · [ENCRYPTION_DESIGN](ENCRYPTION_DESIGN.md) · [PRIVACY_DATA_MAP](PRIVACY_DATA_MAP.md) · [DEPLOYMENT](DEPLOYMENT.md) · [BACKUP_RESTORE](BACKUP_RESTORE.md) · [PROJECT_STATUS](PROJECT_STATUS.md)

## License

The app links **libsignal (AGPL-3.0-only)**, so Vybe is distributed under the **GNU AGPL-3.0** (see [LICENSE](LICENSE)). If you distribute the app or run a modified server for others, you must offer the corresponding source.
