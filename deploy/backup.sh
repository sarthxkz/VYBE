#!/usr/bin/env bash
# Nightly encrypted backup: Postgres dump + private media, encrypted with age to a public key.
# The matching private key must NOT live on this VM (keep it offline / in a password manager).
set -euo pipefail

BACKUP_DIR=/var/backups/vybe
RETENTION_DAYS=14            # matches the 14-day backup window stated in the Privacy Policy
AGE_RECIPIENTS=/etc/vybe/backup-recipients.txt
MEDIA_DIR=/var/lib/vybe/media
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

umask 077
mkdir -p "$BACKUP_DIR"

# Refuse to run if the disk is nearly full rather than leaving a truncated backup.
avail=$(df --output=pcent "$BACKUP_DIR" | tail -1 | tr -dc 0-9)
if [ "$avail" -gt 90 ]; then echo "backup: disk ${avail}% full, aborting" >&2; exit 1; fi

sudo -u postgres pg_dump --format=custom --no-owner vybe \
  | age -R "$AGE_RECIPIENTS" > "$BACKUP_DIR/db-$STAMP.dump.age"

tar -C "$MEDIA_DIR" -cf - . | age -R "$AGE_RECIPIENTS" > "$BACKUP_DIR/media-$STAMP.tar.age"

sha256sum "$BACKUP_DIR"/*-"$STAMP".* > "$BACKUP_DIR/SHA256SUMS-$STAMP"
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete
echo "backup: ok $STAMP"
