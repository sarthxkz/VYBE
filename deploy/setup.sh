#!/usr/bin/env bash
# One-time, idempotent. Run on the VM from ~/vybe/deploy as a docker-group user (no sudo needed):
#   ./setup.sh
# Writes .env (secrets generated here, never leave the VM), adds the Vybe site to Bunkr's Caddy, starts the stack.
set -euo pipefail
cd "$(dirname "$0")"
PUBLIC_HOST=${PUBLIC_HOST:-api.161-153-37-106.sslip.io}
BUNKR_CADDYFILE=${BUNKR_CADDYFILE:-$HOME/bunkr/deploy/Caddyfile}
CADDY_CONTAINER=${CADDY_CONTAINER:-deploy-caddy-1}

umask 077
if [ ! -f .env ]; then
  DBPASS=$(openssl rand -hex 24)
  cat > .env <<ENV
NODE_ENV=production
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

# Append (not sed -i): the Caddyfile is bind-mounted as a single file, so it must keep its inode.
if ! grep -q "$PUBLIC_HOST" "$BUNKR_CADDYFILE"; then
  sed "s/api.161-153-37-106.sslip.io/$PUBLIC_HOST/" Caddyfile.vybe >> "$BUNKR_CADDYFILE"
  echo "setup: added $PUBLIC_HOST to $BUNKR_CADDYFILE"
fi
docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "setup: done. Check: curl https://$PUBLIC_HOST/ready"
