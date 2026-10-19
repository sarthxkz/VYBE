# Backup & restore

## What gets backed up
| Item | How | Encryption | Schedule | Retention |
|---|---|---|---|---|
| PostgreSQL `vybe` DB | `pg_dump --format=custom` | `age` to the public key(s) in `/etc/vybe/backup-recipients.txt` | Nightly ~03:15 UTC (`vybe-backup.timer`) and before every deploy | 14 days |
| Private media (`/var/lib/vybe/media`) | `tar` | `age` | same | 14 days |
| Checksums | `sha256sum` → `SHA256SUMS-<stamp>` | n/a | same | 14 days |

The **private key never lives on the VM**: a stolen backup (or a stolen VM) can't be read. Keep the key offline (password manager or hardware), with a second copy.

Backups are written to `/var/backups/vybe` on the VM's boot volume. **Off-site copy (recommended):** sync that directory to OCI Object Storage or another provider. The files are already encrypted, so a plain `rclone sync` is safe.

## Restore test (do monthly, and after any backup change)
```bash
scp vybe-backup.key <user>@vm:/tmp/k && ssh <user>@vm
sudo /opt/vybe/deploy/restore-test.sh /tmp/k && shred -u /tmp/k
```
It verifies checksums, decrypts the newest DB dump into a scratch database `vybe_restore_test`, prints row counts (users, migrations), lists the media archive, and drops the scratch DB. Record the date and result in PROJECT_STATUS.md.

## Full restore (disaster)
```bash
sudo systemctl stop vybe-api
# DB
age -d -i vybe-backup.key db-<stamp>.dump.age > /tmp/db.dump
sudo -u postgres dropdb vybe && sudo -u postgres createdb -O vybe vybe
sudo -u postgres pg_restore --no-owner --role=vybe -d vybe /tmp/db.dump
# Media
sudo rm -rf /var/lib/vybe/media/* && age -d -i vybe-backup.key media-<stamp>.tar.age | sudo -u vybe tar -C /var/lib/vybe/media -xf -
shred -u /tmp/db.dump
sudo systemctl start vybe-api && curl -fsS http://127.0.0.1:3000/ready
```

## What a restore cannot bring back
- **Chat history**: it lives only on users' devices (E2EE). Only undelivered ciphertext is in the DB.
- Data deleted by users after the backup was taken. Data deleted *before* it was taken stays in older backups until they expire (14 days), as the privacy policy states.

## Status
The scripts are written but **not yet run on the VM**; see PROJECT_STATUS.md.
