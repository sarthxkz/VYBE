# Deployment: Oracle Cloud VM (Ubuntu)

Target: VM `161.153.37.106`, hostname **`api.161-153-37-106.sslip.io`** (sslip.io resolves it to the IP, and Let's Encrypt issues a normal cert). To use a real domain later, change `PUBLIC_HOST`, re-run certbot, and rebuild the app with the new `EXPO_PUBLIC_API_URL`.

```
Internet ──443/80──► nginx (TLS, rate limit) ──127.0.0.1:3000──► vybe-api (systemd, user vybe)
                                                                  ├─ PostgreSQL 17 (localhost:5432)
SSH 22 ◄── admin IP only                                          └─ /var/lib/vybe/media (0700)
```

## 0. Inspect first (read-only)
Check what's already on the box before changing anything:
```bash
ssh -i ~/.ssh/bunkr_oracle <user>@161.153.37.106
sudo ss -tlnp                     # listening services/ports
sudo ufw status verbose
sudo iptables -S | head -50       # Oracle images ship their own rules
cat /etc/iptables/rules.v4 | head -50
systemctl list-units --type=service --state=running
df -h; free -m; lsb_release -a
```
**Oracle Ubuntu images** include `iptables` rules (`/etc/iptables/rules.v4`, loaded by `netfilter-persistent`) that `REJECT` everything except SSH. Either:
- **Keep iptables** and add rules for 80/443 *above* the final REJECT: `sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -m state --state NEW -j ACCEPT && sudo netfilter-persistent save`, and skip UFW; or
- **Switch to UFW**: `sudo apt purge netfilter-persistent iptables-persistent` (after confirming you won't lock yourself out), then let `setup-vm.sh` configure UFW.

Pick one firewall manager. Don't run both.

## 1. OCI network (console)
VCN → Security List (or NSG) for the VM's subnet. **Ingress:**
| Source | Protocol/Port | Why |
|---|---|---|
| `<your IP>/32` | TCP 22 | SSH (admin only) |
| `0.0.0.0/0` | TCP 80 | ACME challenge + redirect |
| `0.0.0.0/0` | TCP 443 | HTTPS + WSS |

Remove any default `0.0.0.0/0 → 22` rule once your admin rule works. **Never** add 3000, 5432 or 6379.

## 2. Provision
```bash
sudo mkdir -p /opt/vybe && sudo chown $USER /opt/vybe
git clone <repo-url> /opt/vybe
cd /opt/vybe
sudo PUBLIC_HOST=api.161-153-37-106.sslip.io ADMIN_IP=<your.ip>/32 LE_EMAIL=<you@example.com> ./deploy/setup-vm.sh
```
This installs Postgres 17 (localhost only, scram auth), Node 24, nginx, certbot, age; creates the `vybe` system user, a least-privilege DB role with a random password, `/etc/vybe/vybe.env` (mode 640) with a fresh `JWT_SECRET`; configures UFW, nginx and TLS (with auto-renewal); and installs the systemd units.

Then:
1. **Backups key:** on your own computer, `age-keygen -o vybe-backup.key` (keep it offline). Put the `# public key: age1…` value in `/etc/vybe/backup-recipients.txt` on the VM.
2. **SMTP:** set `SMTP_URL` (e.g. `smtps://user:pass@smtp.provider.com:465`) and `MAIL_FROM` in `/etc/vybe/vybe.env`. Without it, verification codes are not sent (the logs say so).
3. Optional: `GOOGLE_CLIENT_IDS`, and `FCM_SERVICE_ACCOUNT_PATH=/etc/vybe/fcm.json` (mode 640, group vybe).

## 3. Deploy / update
```bash
sudo -u vybe git -C /opt/vybe pull
sudo /opt/vybe/deploy/deploy.sh      # backup → npm ci → build → migrate deploy → restart → /ready check
```
**Rollback:** `sudo -u vybe git -C /opt/vybe checkout <previous-tag> && sudo /opt/vybe/deploy/deploy.sh`. Migrations are additive by policy (DATABASE.md), so the previous release runs on the newer schema. For a bad migration, restore the pre-deploy backup (BACKUP_RESTORE.md).

## 4. Verify (don't assume)
From the VM:
```bash
sudo ss -tlnp | grep -E ':(3000|5432)'   # must show 127.0.0.1 only
curl -fsS http://127.0.0.1:3000/ready
sudo certbot renew --dry-run
systemctl status vybe-api vybe-backup.timer certbot.timer
```
From **outside** (your laptop):
```bash
curl -fsS https://api.161-153-37-106.sslip.io/health
nmap -Pn -p 22,80,443,3000,5432,6379 161.153.37.106   # expect 80/443 open, 22 open only from your IP, the rest filtered
```
A WebSocket check needs a token: `npx wscat -c wss://api.161-153-37-106.sslip.io/ws -H "Authorization: Bearer <token>"` should print a `hello` event.

## 5. Build the Android app against production
```bash
cd apps/mobile
APP_VARIANT=production EXPO_PUBLIC_API_URL=https://api.161-153-37-106.sslip.io npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease     # sign with your upload keystore (never commit it)
```

## Operations
- **Logs:** `journalctl -u vybe-api -f` (structured JSON, secrets redacted). nginx: `/var/log/nginx/vybe.access.log` (no query strings), rotated by logrotate.
- **Restart policy:** systemd `Restart=on-failure`; `MemoryMax=768M`.
- **Health:** `/health` (liveness), `/ready` (DB). Point an uptime monitor at `https://…/health`.
- **Disk:** `backup.sh` refuses to run above 90% usage. Add a monthly check of `df -h`.
- **Dependency updates:** monthly `npm audit` + `npx expo install --check`; patch, run the full test suite, deploy.
- **Scaling note:** rate limits and presence are in-process. Before running a 2nd API process, add Redis (see the `shortcut:` comments).

## Incident response (short)
1. **Contain:** `sudo systemctl stop vybe-api` (or block at nginx) if data is leaking.
2. **Revoke:** rotate `JWT_SECRET` in `/etc/vybe/vybe.env` and restart (invalidates every access token; refresh tokens still need valid sessions). To force everyone out: `UPDATE sessions SET "revokedAt" = now() WHERE "revokedAt" IS NULL;`.
3. **Investigate:** `audit_events`, `journalctl -u vybe-api --since …`, nginx logs.
4. **Recover:** restore from backup if needed; redeploy a known-good tag.
5. **Notify** affected users and authorities as required by law; write a postmortem.
