#!/usr/bin/env bash
# Proves the latest backup restores: decrypts into a scratch DB, runs sanity queries, drops it.
# Usage: restore-test.sh /path/to/age-identity.txt   (bring the private key temporarily; delete after)
set -euo pipefail
IDENTITY=${1:?path to age identity (private key) required}
BACKUP_DIR=/var/backups/vybe
latest=$(ls -1t "$BACKUP_DIR"/db-*.dump.age | head -1)
stamp=${latest##*/db-}; stamp=${stamp%.dump.age}

(cd "$BACKUP_DIR" && sha256sum -c "SHA256SUMS-$stamp")

scratch=vybe_restore_test
sudo -u postgres dropdb --if-exists "$scratch"
sudo -u postgres createdb "$scratch"
age -d -i "$IDENTITY" "$latest" | sudo -u postgres pg_restore --no-owner -d "$scratch"
sudo -u postgres psql -d "$scratch" -At -c "SELECT 'users', count(*) FROM users UNION ALL SELECT 'migrations', count(*) FROM _prisma_migrations;"
age -d -i "$IDENTITY" "$BACKUP_DIR/media-$stamp.tar.age" | tar -tf - | wc -l | xargs echo "media files:"
sudo -u postgres dropdb "$scratch"
echo "restore-test: ok ($stamp)"
