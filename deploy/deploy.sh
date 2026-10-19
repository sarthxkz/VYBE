#!/usr/bin/env bash
# Build and roll out the API on the VM:  sudo -u vybe git -C /opt/vybe pull && sudo /opt/vybe/deploy/deploy.sh
# Rollback: check out the previous tag and run this again (migrations are additive; see DATABASE.md).
set -euo pipefail
cd /opt/vybe

# Back up before migrating, every time.
/opt/vybe/deploy/backup.sh

as_vybe() { sudo -u vybe bash -c "set -a; . /etc/vybe/vybe.env; set +a; cd /opt/vybe; $1"; }
as_vybe "npm ci --workspace apps/server"
as_vybe "npm run build --workspace apps/server"
as_vybe "cd apps/server && npx prisma migrate deploy"

systemctl restart vybe-api
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/ready >/dev/null; then echo "deploy: ready"; exit 0; fi
  sleep 1
done
echo "deploy: API did not become ready; check: journalctl -u vybe-api -n 100" >&2
exit 1
