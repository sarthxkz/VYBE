# Graph Report - apps  (2026-10-19)

## Corpus Check
- Corpus is ~46,974 words - fits in a single context window. You may not need a graph.

## Summary
- 833 nodes · 2624 edges · 37 communities (29 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Mobile Auth & API Client
- Signal Protocol Store
- Chat & Realtime (App)
- API HTTP Core
- Server Config & Notifications
- Mobile Dependencies
- Server Test Harness
- Signal Test Client
- Server Dependencies
- Authz & Realtime Fan-out
- Expo Native Modules
- Session & Query State
- Map & Location Deps
- Friend Graph Authorization
- Keystore State File
- Location Tracking & Map
- Media Storage & Retention
- UI Toolkit Deps
- Mobile TS Config
- Lint Tooling
- Test Tooling
- Onboarding Illustrations
- Server TS Config
- Crypto Deps
- Server Build Config
- Rate Limiting
- Android Build Plugin
- ESLint Config
- Legal Content
- Test DB Setup
- Misc Cluster 30
- Misc Cluster 31
- Misc Cluster 32
- Misc Cluster 34

## God Nodes (most connected - your core abstractions)
1. `Text()` - 61 edges
2. `api()` - 60 edges
3. `useColors()` - 57 edges
4. `Button()` - 53 edges
5. `Screen()` - 50 edges
6. `VybeProtocolStore` - 42 edges
7. `react-native` - 34 edges
8. `errorText()` - 31 edges
9. `Avatar()` - 30 edges
10. `space` - 28 edges

## Surprising Connections (you probably didn't know these)
- `VybeSignalModule` --calls--> `SecureStateFile`  [INFERRED]
  mobile/modules/vybe-signal/android/src/main/java/expo/modules/vybesignal/VybeSignalModule.kt → mobile/modules/vybe-signal/android/src/main/java/expo/modules/vybesignal/SecureStateFile.kt
- `VybeProtocolStore` --references--> `SecureStateFile`  [EXTRACTED]
  mobile/modules/vybe-signal/android/src/main/java/expo/modules/vybesignal/VybeProtocolStore.kt → mobile/modules/vybe-signal/android/src/main/java/expo/modules/vybesignal/SecureStateFile.kt
- `VybeSignalModule` --calls--> `VybeProtocolStore`  [INFERRED]
  mobile/modules/vybe-signal/android/src/main/java/expo/modules/vybesignal/VybeSignalModule.kt → mobile/modules/vybe-signal/android/src/main/java/expo/modules/vybesignal/VybeProtocolStore.kt
- `uploadImage()` --calls--> `ApiError`  [EXTRACTED]
  mobile/src/lib/images.ts → mobile/src/api/client.ts
- `uploadImage()` --calls--> `refreshSession()`  [EXTRACTED]
  mobile/src/lib/images.ts → mobile/src/api/client.ts

## Import Cycles
- None detected.

## Communities (37 total, 8 thin omitted)

### Community 0 - "Mobile Auth & API Client"
Cohesion: 0.08
Nodes (110): api(), mediaSource(), Opts, AuthTokens, Friend, FriendLocation, FriendRequest, LocationPoint (+102 more)

### Community 1 - "Signal Protocol Store"
Cohesion: 0.06
Nodes (8): b64(), skey(), unb64(), VybeProtocolStore, b64(), SignalError, unb64(), VybeSignalModule

### Community 2 - "Chat & Realtime (App)"
Cohesion: 0.07
Nodes (65): Bundle, PreKeys, Registration, SignedKey, VybeSignalModule, API_URL, ApiError, refreshSession() (+57 more)

### Community 3 - "API HTTP Core"
Cohesion: 0.12
Nodes (37): express, zod, createApp(), authenticate(), requireAdmin(), requireAuth(), revokeAllSessions(), uid() (+29 more)

### Community 4 - "Server Config & Notifications"
Cohesion: 0.08
Nodes (39): google-auth-library, jose, config, isProd, parsed, schema, audit(), ACCESS_TTL_SEC (+31 more)

### Community 5 - "Mobile Dependencies"
Cohesion: 0.05
Nodes (43): dependencies, expo, expo-application, expo-build-properties, expo-camera, expo-constants, expo-crypto, expo-dev-client (+35 more)

### Community 6 - "Server Test Harness"
Cohesion: 0.16
Nodes (18): pino, sharp, vitest, hashPassword(), db, redactPaths, api(), app (+10 more)

### Community 7 - "Signal Test Client"
Cohesion: 0.09
Nodes (6): @signalapp/libsignal-client, registered(), b64(), SignalClient, Stores, unb64()

### Community 8 - "Server Dependencies"
Cohesion: 0.07
Nodes (28): eslint, typescript, license, main, name, private, version, expo-application (+20 more)

### Community 9 - "Authz & Realtime Fan-out"
Cohesion: 0.10
Nodes (20): ws, realtime, server, shutdown(), stopJobs, canMessage, Claimed, keyId (+12 more)

### Community 10 - "Expo Native Modules"
Cohesion: 0.08
Nodes (25): argon2, express-rate-limit, firebase-admin, helmet, multer, nodemailer, pino-http, @prisma/adapter-pg (+17 more)

### Community 11 - "Session & Query State"
Cohesion: 0.13
Nodes (15): Me, INTRO_KEY, queryClient, onSignOut(), signOutHooks, State, expo-device, @expo-google-fonts/bricolage-grotesque (+7 more)

### Community 12 - "Map & Location Deps"
Cohesion: 0.11
Nodes (18): dependencies, argon2, express, express-rate-limit, firebase-admin, google-auth-library, helmet, jose (+10 more)

### Community 13 - "Friend Graph Authorization"
Cohesion: 0.20
Nodes (17): areFriends(), canInteract(), canSeeLocation(), canViewMedia(), canViewPhoto(), Client, friendIds(), isBlockedEither() (+9 more)

### Community 15 - "Location Tracking & Map"
Cohesion: 0.15
Nodes (13): ensurePermissionThenTrack(), cluster, Pt, NOW, LOCATION_TASK, permissionLevel, sleep(), startTracking() (+5 more)

### Community 16 - "Media Storage & Retention"
Cohesion: 0.18
Nodes (11): ago(), runCleanup(), startJobs(), deleteMedia(), mediaPath(), mediaRoot, unlinkMedia(), writeMedia() (+3 more)

### Community 17 - "UI Toolkit Deps"
Cohesion: 0.12
Nodes (17): devDependencies, eslint, @eslint/js, prisma, @signalapp/libsignal-client, supertest, tsx, @types/express (+9 more)

### Community 18 - "Mobile TS Config"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, module, moduleResolution, noImplicitOverride, noUncheckedIndexedAccess, outDir, resolveJsonModule (+6 more)

### Community 19 - "Lint Tooling"
Cohesion: 0.20
Nodes (10): scripts, build, db:deploy, db:migrate, dev, lint, postinstall, start (+2 more)

### Community 20 - "Test Tooling"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-expo, jest, jest-expo, @testing-library/react-native, @types/jest, @types/react (+1 more)

### Community 21 - "Onboarding Illustrations"
Cohesion: 0.28
Nodes (8): ChatIllustration(), ControlIllustration(), MapIllustration(), PhotoIllustration(), Pin(), Pulse(), react-native-reanimated, react-native-svg

### Community 22 - "Server TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, noUncheckedIndexedAccess, paths, strict, extends, include, @modules/*, expo/tsconfig.base

### Community 23 - "Crypto Deps"
Cohesion: 0.29
Nodes (7): scripts, android, lint, prebuild, start, test, typecheck

### Community 24 - "Server Build Config"
Cohesion: 0.29
Nodes (6): ./tsconfig.json, compilerOptions, outDir, rootDir, extends, include

### Community 25 - "Rate Limiting"
Cohesion: 0.40
Nodes (3): handler(), limits, make()

### Community 26 - "Android Build Plugin"
Cohesion: 0.40
Nodes (3): config, { withAppBuildGradle }, expo

### Community 27 - "ESLint Config"
Cohesion: 0.40
Nodes (3): { defineConfig }, expoConfig, eslint-config-expo

### Community 28 - "Legal Content"
Cohesion: 0.50
Nodes (3): Doc, docs, REVIEW_NOTICE

### Community 30 - "Misc Cluster 30"
Cohesion: 0.67
Nodes (3): allowScripts, @parcel/watcher, unrs-resolver

## Knowledge Gaps
- **30 isolated node(s):** `@types/geojson`, `expo-application`, `expo-build-properties`, `expo-dev-client`, `expo-font` (+25 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 312 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Mobile Dependencies` to `Server Dependencies`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `@types/geojson`, `expo-application`, `expo-build-properties` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mobile Auth & API Client` be split into smaller, more focused modules?**
  _Cohesion score 0.07978115302956067 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `Mobile Auth & API Client` to `Server Dependencies`, `Chat & Realtime (App)`, `Session & Query State`, `Onboarding Illustrations`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Signal Protocol Store` be split into smaller, more focused modules?**
  _Cohesion score 0.06148088746324512 - nodes in this community are weakly interconnected._
- **Why does `expo-router` connect `Mobile Auth & API Client` to `Server Dependencies`, `Misc Cluster 33`, `Chat & Realtime (App)`, `Session & Query State`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `Chat & Realtime (App)` be split into smaller, more focused modules?**
  _Cohesion score 0.06596491228070175 - nodes in this community are weakly interconnected._