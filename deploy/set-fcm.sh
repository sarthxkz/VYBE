#!/usr/bin/env bash
# Turn on push notifications (Firebase Cloud Messaging) with a service-account key from the Firebase console:
#   scp the downloaded JSON to the VM, then:  ~/vybe/deploy/set-fcm.sh ~/fcm.json
# The key is stored base64 in .env (mode 600) and the copy you uploaded is deleted.
set -euo pipefail
cd "$(dirname "$0")"
F=${1:-}
[ -f "$F" ] || { echo "Usage: $0 <service-account.json>" >&2; exit 2; }
if ! jq -e '.type == "service_account" and (.project_id|length>0) and (.private_key|startswith("-----BEGIN PRIVATE KEY-----")) and (.client_email|length>0)' "$F" >/dev/null 2>&1; then
  echo "That isn't a Firebase service-account key (Project settings → Service accounts → Generate new private key). Nothing changed." >&2
  exit 1
fi
PROJECT=$(jq -r .project_id "$F")
umask 077
grep -vE '^(FCM_SERVICE_ACCOUNT_B64|FCM_SERVICE_ACCOUNT_PATH)=' .env > .env.new
printf 'FCM_SERVICE_ACCOUNT_B64=%s\n' "$(base64 -w0 "$F")" >> .env.new
mv .env.new .env
shred -u "$F" 2>/dev/null || rm -f "$F"
docker compose up -d vybe-api >/dev/null
echo "Push key for Firebase project \"$PROJECT\" saved; the uploaded copy was deleted. Push notifications are on."
