#!/usr/bin/env bash
# Nightly encrypted backup: Postgres dump + private media, encrypted with age to a public key.
# The matching private key must NOT live on this VM (keep it offline / in a password manager).
# Cron (user crontab, no sudo):  17 3 * * * $HOME/vybe/deploy/backup.sh >> $HOME/vybe-backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"

BACKUP_DIR=${BACKUP_DIR:-$HOME/vybe-backups}
RETENTION_DAYS=14            # matches the 14-day backup window stated in the Privacy Policy
AGE_RECIPIENTS=${AGE_RECIPIENTS:-$HOME/.config/vybe/backup-recipients.txt}
AGE=${AGE:-$HOME/bin/age}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

[ -s "$AGE_RECIPIENTS" ] || { echo "backup: no age public key at $AGE_RECIPIENTS" >&2; exit 1; }
umask 077
mkdir -p "$BACKUP_DIR"

# Refuse to run if the disk is nearly full rather than leaving a truncated backup.
used=$(df --output=pcent "$BACKUP_DIR" | tail -1 | tr -dc 0-9)
if [ "$used" -gt 90 ]; then echo "backup: disk ${used}% full, aborting" >&2; exit 1; fi

docker compose exec -T db pg_dump -U vybe --format=custom --no-owner vybe \
  | "$AGE" -R "$AGE_RECIPIENTS" > "$BACKUP_DIR/db-$STAMP.dump.age"

docker compose exec -T vybe-api tar -C /data/media -cf - . \
  | "$AGE" -R "$AGE_RECIPIENTS" > "$BACKUP_DIR/media-$STAMP.tar.age"

(cd "$BACKUP_DIR" && sha256sum ./*-"$STAMP".* > "SHA256SUMS-$STAMP")
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete
echo "backup: ok $STAMP"
