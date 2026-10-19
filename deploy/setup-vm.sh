#!/usr/bin/env bash
# One-time, idempotent provisioning for Ubuntu on Oracle Cloud. Run as a sudo-capable user:
#   sudo PUBLIC_HOST=api.161-153-37-106.sslip.io ADMIN_IP=<your.ip>/32 LE_EMAIL=you@example.com ./deploy/setup-vm.sh
# Read DEPLOYMENT.md first. Nothing here opens 5432/6379/3000 to the internet.
set -euo pipefail
: "${PUBLIC_HOST:?set PUBLIC_HOST}" "${ADMIN_IP:?set ADMIN_IP (CIDR allowed to SSH)}" "${LE_EMAIL:?set LE_EMAIL for Let's Encrypt}"

apt-get update
apt-get install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx ufw age postgresql-common

# PostgreSQL 17 from PGDG
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get install -y postgresql-17

# Node.js 24 LTS from NodeSource
if ! node -v 2>/dev/null | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Postgres: local socket + loopback only, scram auth.
PGCONF=/etc/postgresql/17/main
sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" $PGCONF/postgresql.conf
sed -i "s/^#\?password_encryption.*/password_encryption = scram-sha-256/" $PGCONF/postgresql.conf
systemctl restart postgresql

# Least-privilege role: owns only the vybe database (needed for migrations), no superuser/createrole.
if ! sudo -u postgres psql -Atc "SELECT 1 FROM pg_roles WHERE rolname='vybe'" | grep -q 1; then
  DBPASS=$(openssl rand -base64 36 | tr -d '/+=')
  sudo -u postgres psql -c "CREATE ROLE vybe LOGIN PASSWORD '$DBPASS' NOSUPERUSER NOCREATEDB NOCREATEROLE"
  sudo -u postgres createdb -O vybe vybe
  echo "Generated DB password; it is written only to /etc/vybe/vybe.env"
fi

# Service user and directories
id vybe >/dev/null 2>&1 || useradd --system --home /opt/vybe --shell /usr/sbin/nologin vybe
chown -R vybe:vybe /opt/vybe
install -d -o vybe -g vybe -m 700 /var/lib/vybe/media
install -d -o root -g vybe -m 750 /etc/vybe
install -d -o root -g root -m 700 /var/backups/vybe

if [ ! -f /etc/vybe/vybe.env ]; then
  cat > /etc/vybe/vybe.env <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
PUBLIC_URL=https://$PUBLIC_HOST
DATABASE_URL=postgresql://vybe:${DBPASS:-CHANGE_ME}@localhost:5432/vybe
JWT_SECRET=$(openssl rand -base64 48)
MEDIA_DIR=/var/lib/vybe/media
TRUST_PROXY=1
LOG_LEVEL=info
SMTP_URL=
MAIL_FROM="Vybe <no-reply@$PUBLIC_HOST>"
GOOGLE_CLIENT_IDS=
FCM_SERVICE_ACCOUNT_PATH=
ENV
  chown root:vybe /etc/vybe/vybe.env
  chmod 640 /etc/vybe/vybe.env
fi

# Firewall. Oracle's Ubuntu images ship iptables rules in /etc/iptables/rules.v4 that UFW does not manage;
# DEPLOYMENT.md explains how to reconcile them. The OCI security list must match these rules too.
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_IP" to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# nginx + TLS
sed "s/__HOST__/$PUBLIC_HOST/g" /opt/vybe/deploy/nginx-vybe.conf > /etc/nginx/sites-available/vybe
ln -sf /etc/nginx/sites-available/vybe /etc/nginx/sites-enabled/vybe
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$PUBLIC_HOST" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect
systemctl enable --now certbot.timer

# App service + backups
cp /opt/vybe/deploy/vybe-api.service /etc/systemd/system/
cp /opt/vybe/deploy/vybe-backup.service /opt/vybe/deploy/vybe-backup.timer /etc/systemd/system/
chmod 750 /opt/vybe/deploy/backup.sh /opt/vybe/deploy/restore-test.sh
systemctl daemon-reload
systemctl enable vybe-api vybe-backup.timer

echo "Provisioned. Next: put your age PUBLIC key in /etc/vybe/backup-recipients.txt, then run deploy/deploy.sh"
