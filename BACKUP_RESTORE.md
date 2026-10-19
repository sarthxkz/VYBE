# Backup & restore

## What gets backed up
| Item | How | Encryption | Schedule | Retention |
|---|---|---|---|---|
| PostgreSQL `vybe` DB | `pg_dump --format=custom` | `age` to the public key(s) in `~/.config/vybe/backup-recipients.txt` | Nightly 03:17 UTC (user crontab) and before every deploy | 14 days |
| Private media (volume `vybe_media`, `/data/media`) | `tar` inside the API container | `age` | same | 14 days |
| Checksums | `sha256sum` → `SHA256SUMS-<stamp>` | n/a | same | 14 days |

The **private key never lives on the VM**: a stolen backup (or a stolen VM) can't be read. Keep the key offline (password manager or hardware), with a second copy.

Backups are written to `~/vybe-backups` on the VM's boot volume. **Off-site copy (recommended):** sync that directory to OCI Object Storage or another provider. The files are already encrypted, so a plain `rclone sync` is safe.

## Restore test (do monthly, and after any backup change)
```bash
scp vybe-backup.key sarthak@vm:/tmp/k && ssh sarthak@vm
~/vybe/deploy/restore-test.sh /tmp/k && shred -u /tmp/k
```
It verifies checksums, decrypts the newest DB dump into a scratch database `vybe_restore_test`, prints row counts (users, migrations), lists the media archive, and drops the scratch DB. Record the date and result in PROJECT_STATUS.md.

## Full restore (disaster)
```bash
cd ~/vybe/deploy && docker compose stop vybe-api
# DB
~/bin/age -d -i vybe-backup.key db-<stamp>.dump.age > /tmp/db.dump
docker compose exec -T db dropdb -U vybe --if-exists vybe_old
docker compose exec -T db psql -U vybe -d postgres -c 'ALTER DATABASE vybe RENAME TO vybe_old' -c 'CREATE DATABASE vybe'
docker compose exec -T db pg_restore -U vybe --no-owner -d vybe < /tmp/db.dump
# Media
~/bin/age -d -i vybe-backup.key media-<stamp>.tar.age | docker compose run --rm --no-deps -T --entrypoint sh vybe-api -c 'rm -rf /data/media/* && tar -C /data/media -xf -'
shred -u /tmp/db.dump
docker compose up -d vybe-api && curl -fsS https://api.161-153-37-106.sslip.io/ready
```
Drop `vybe_old` once the restored app checks out.

## What a restore cannot bring back
- **Chat history**: it lives only on users' devices (E2EE). Only undelivered ciphertext is in the DB.
- Data deleted by users after the backup was taken. Data deleted *before* it was taken stays in older backups until they expire (14 days), as the privacy policy states.

## Status
The scripts are written but **not yet run on the VM**; see PROJECT_STATUS.md.
