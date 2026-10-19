#!/usr/bin/env bash
# One-time, idempotent. Run on the VM from ~/vybe/deploy as a docker-group user (no sudo needed):
#   ./setup.sh
# Writes .env (secrets generated here, never leave the VM) and starts the stack (Caddy on 80/443).
set -euo pipefail
cd "$(dirname "$0")"
PUBLIC_HOST=${PUBLIC_HOST:-api.161-153-37-106.sslip.io}

umask 077
if [ ! -f .env ]; then
  DBPASS=$(openssl rand -hex 24)
  cat > .env <<ENV
NODE_ENV=production
PUBLIC_HOST=$PUBLIC_HOST
PUBLIC_URL=https://$PUBLIC_HOST
POSTGRES_PASSWORD=$DBPASS
DATABASE_URL=postgresql://vybe:$DBPASS@db:5432/vybe
JWT_SECRET=$(openssl rand -base64 48)
TRUST_PROXY=1
LOG_LEVEL=info
SMTP_URL=
MAIL_FROM="Vybe <no-reply@$PUBLIC_HOST>"
GOOGLE_CLIENT_IDS=
FCM_SERVICE_ACCOUNT_PATH=
ENV
  echo "setup: wrote .env (mode 600)"
fi

docker compose up -d --build

echo "setup: done. Check: curl https://$PUBLIC_HOST/ready"
