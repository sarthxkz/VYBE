# Deployment: Oracle Cloud VM (Ubuntu 24.04, arm64)

Target: VM `161.153.37.106` (2 Ampere cores, 11 GB RAM), hostname **`api.161-153-37-106.sslip.io`** (sslip.io resolves it to the IP, and Let's Encrypt issues a normal cert). Vybe runs as one Docker Compose project, and its Caddy owns ports 80/443. No `sudo` is needed because the deploy user is in the `docker` group.

```
Internet ──443/80──► caddy (TLS, auto-renew) ──edge net──► vybe-api:3000 ──internal net──► db (Postgres 17)
                                                                  │                       volume vybe_db-data
                                                                  └─ volume vybe_media (/data/media, 0700)
```
- `db` sits only on an `internal: true` network, with no published port and no route to the internet.
- `vybe-api` publishes no port. Caddy reaches it over the `edge` network, which is also the API's route out to SMTP, FCM and Google.
- Migrations run as a one-shot `migrate` container (the build stage, which has the Prisma CLI) before the API starts.

## 0. Inspection (2026-10-19, read-only)
- User `sarthak` (groups: sudo, docker). `sudo` asks for a password.
- Host firewall (iptables, Oracle default; no ufw): INPUT allows 22, 80, 443, ICMP and loopback, and REJECTs everything else. Docker-published ports bypass INPUT, and only Caddy publishes any (80/443).
- The VM previously ran Bunkr behind its own Caddy. **Bunkr was removed on 2026-10-19** at your request (containers, volumes, network, image, `~/bunkr`). Its final backup was deleted too, so no Bunkr data remains.
- Listening: 22, 80, 443 (Caddy via docker-proxy), 111 (rpcbind), 53 (localhost resolver). From outside: **22, 80, 443 open; 111, 3000, 5432, 2019 filtered.**
- No Node, Postgres or nginx on the host; Docker 29.9.1 and git present. Disk 193 GB, 5% used.

Recommended (needs sudo, your call): `sudo systemctl disable --now rpcbind rpcbind.socket`. It's filtered from outside today, but nothing here needs it.

## 1. OCI network (console)
VCN → Security List (or NSG) for the VM's subnet. **Ingress:** TCP 22 from `<your IP>/32` only, TCP 80 and 443 from `0.0.0.0/0`. **Never** add 3000 or 5432. Remove any default `0.0.0.0/0 → 22` once your admin rule works.

## 2. First deploy
From your PC (the repo has no remote; this ships the committed tree):
```bash
git archive --format=tar HEAD | ssh -i ~/.ssh/bunkr_oracle sarthak@161.153.37.106 'mkdir -p ~/vybe && tar -x -C ~/vybe'
ssh -i ~/.ssh/bunkr_oracle sarthak@161.153.37.106 'cd ~/vybe/deploy && ./setup.sh'
```
`setup.sh` is idempotent. It writes `deploy/.env` (mode 600, random DB password and `JWT_SECRET`; it never leaves the VM) and runs `docker compose up -d --build`. Caddy obtains the certificate on first start.

Then:
1. **SMTP (required for sign-up):** set `SMTP_URL` (e.g. `smtps://user:pass@smtp.provider.com:465`) and `MAIL_FROM` in `~/vybe/deploy/.env`, then run `docker compose up -d`. **Gmail:** use an [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification). The URL is `smtps://you%40gmail.com:<app-password-without-spaces>@smtp.gmail.com:465`, and `MAIL_FROM` must be that same address. Gmail caps sending at about 500 emails a day; move to a transactional provider before launch. Without it, verification codes aren't sent (the logs say so) and new accounts can't verify.
2. **Backups key:** on your own computer, run `age-keygen -o vybe-backup.key` and keep the key offline. On the VM: `mkdir -p ~/.config/vybe ~/bin`, put the `age1…` public key in `~/.config/vybe/backup-recipients.txt`, and install the `age` linux-arm64 binary to `~/bin/age` from https://github.com/FiloSottile/age/releases. Add the cron line from `backup.sh`.
3. Optional: `GOOGLE_CLIENT_IDS`. For push, mount a service-account JSON and set `FCM_SERVICE_ACCOUNT_PATH`.

## 3. Update / rollback
```bash
git archive --format=tar HEAD | ssh … 'tar -x -C ~/vybe'
ssh … 'cd ~/vybe/deploy && ./backup.sh && docker compose up -d --build'
```
**Rollback:** archive the previous commit (`git archive <tag>`) and run the same commands. Migrations are additive by policy (DATABASE.md), so the previous release runs on the newer schema. For a bad migration, restore the pre-deploy backup (BACKUP_RESTORE.md).

## 4. Verify (don't assume)
On the VM:
```bash
cd ~/vybe/deploy && docker compose ps            # db healthy, migrate exited 0, vybe-api healthy
docker compose logs --tail 50 vybe-api
docker port vybe-vybe-api-1; docker port vybe-db-1   # both print nothing: only caddy publishes 80/443
```
From **outside**:
```bash
curl -fsS https://api.161-153-37-106.sslip.io/health
nmap -Pn -p 22,80,443,3000,5432 161.153.37.106    # expect 22/80/443 open, the rest filtered
```
A WebSocket check needs a token: `npx wscat -c wss://api.161-153-37-106.sslip.io/ws -H "Authorization: Bearer <token>"` should print a `hello` event.

## 5. Build the Android app against production
On any OS with Docker (this avoids the Windows path-length problem):
```bash
cd apps/mobile
docker build -f Dockerfile.android --build-arg EXPO_PUBLIC_API_URL=https://api.161-153-37-106.sslip.io --output dist .
```
`dist/vybe-release.apk` is arm64-only and signed with a throwaway debug key: fine for side-loading tests. Play Store releases need your own upload keystore (never commit it).

## App updates hosting
Caddy serves `~/vybe/deploy/public` read-only: `/ota/...` (signed OTA manifests and content-addressed bundles/assets) and `/app/android/...` (APKs and `latest.json`). `apps/mobile/scripts/publish.mjs` uploads there over SSH, and the file clients poll moves into place last. The VM never holds a signing key. There's no directory listing; missing files return 404.

## Admin panel
The API serves a web admin panel at `https://<host>/admin/`: server and database health, storage, usage numbers, recent app crashes, and the open-reports queue with resolve actions. It needs an account with the `ADMIN` role. Grant one on the VM (prints a generated password once; it's stored only as an argon2 hash):
```bash
cd ~/vybe/deploy && docker compose exec vybe-api node dist/cli/make-admin.js you@example.com
# existing account: promoted, password unchanged; add --new-password to issue a fresh one
```
To turn the panel off, set `ADMIN_PANEL=off` in `deploy/.env` and `docker compose up -d`. The login is rate limited and audited like the app's; there's no 2FA yet, so use a long unique password.

## Operations
- **Logs:** `docker compose logs -f vybe-api` (structured JSON, secrets redacted).
- **Restart policy:** `unless-stopped` on db and API; the API has a `/ready` health check.
- **Health:** `/health` (liveness), `/ready` (DB). Point an uptime monitor at `https://…/health`.
- **Disk:** `backup.sh` refuses to run above 90% usage. Check `df -h` and `docker system df` monthly.
- **Dependency updates:** monthly `npm audit` + `npx expo install --check`; patch, run the full test suite, deploy.
- **Scaling note:** rate limits and presence are in-process. Before running a second API process, add Redis (see the `shortcut:` comments).

## Incident response (short)
1. **Contain:** `docker compose stop vybe-api` if data is leaking.
2. **Revoke:** rotate `JWT_SECRET` in `deploy/.env` and run `docker compose up -d`. This invalidates every access token; refresh tokens still need valid sessions. To force everyone out: `docker compose exec db psql -U vybe -c 'UPDATE sessions SET "revokedAt" = now() WHERE "revokedAt" IS NULL;'`.
3. **Investigate:** `audit_events`, `docker compose logs --since …`.
4. **Recover:** restore from backup if needed; redeploy a known-good commit.
5. **Notify** affected users and authorities as required by law; write a postmortem.
