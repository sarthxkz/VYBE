#!/usr/bin/env bash
# Proves the latest backup restores: decrypts into a scratch DB, runs sanity queries, drops it.
# Usage: restore-test.sh /path/to/age-identity.txt   (bring the private key temporarily; delete after)
set -euo pipefail
cd "$(dirname "$0")"
IDENTITY=${1:?path to age identity (private key) required}
BACKUP_DIR=${BACKUP_DIR:-$HOME/vybe-backups}
AGE=${AGE:-$HOME/bin/age}
latest=$(ls -1t "$BACKUP_DIR"/db-*.dump.age | head -1)
stamp=${latest##*/db-}; stamp=${stamp%.dump.age}

(cd "$BACKUP_DIR" && sha256sum -c "SHA256SUMS-$stamp")

scratch=vybe_restore_test
psql() { docker compose exec -T db psql -U vybe -d "$@"; }
psql vybe -c "DROP DATABASE IF EXISTS $scratch" -c "CREATE DATABASE $scratch"
"$AGE" -d -i "$IDENTITY" "$latest" | docker compose exec -T db pg_restore -U vybe --no-owner -d "$scratch"
psql "$scratch" -At -c "SELECT 'users', count(*) FROM users UNION ALL SELECT 'migrations', count(*) FROM _prisma_migrations;"
"$AGE" -d -i "$IDENTITY" "$BACKUP_DIR/media-$stamp.tar.age" | tar -tf - | wc -l | xargs echo "media files:"
psql vybe -c "DROP DATABASE $scratch"
echo "restore-test: ok ($stamp)"
