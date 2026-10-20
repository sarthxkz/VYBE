#!/usr/bin/env bash
# Store a GIF provider key (KLIPY or GIPHY) for chat GIFs, without it touching shell history or the screen:
#   ~/vybe/deploy/set-gif-key.sh
set -euo pipefail
cd "$(dirname "$0")"
read -r -p "Provider, klipy or giphy [klipy]: " P
P=$(echo "${P:-klipy}" | tr '[:upper:]' '[:lower:]')
case "$P" in
  klipy) VAR=KLIPY_API_KEY ;;
  giphy) VAR=GIPHY_API_KEY ;;
  *) echo "Type klipy or giphy." >&2; exit 1 ;;
esac
read -rs -p "$P API key (hidden): " KEY; echo
KEY=${KEY// /}
if ! [[ $KEY =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then echo "That doesn't look like an API key (${#KEY} characters). Nothing changed." >&2; exit 1; fi
if [ "$P" = klipy ]; then URL="https://api.klipy.com/api/v1/$KEY/gifs/trending?per_page=1&customer_id=setup-check"; else URL="https://api.giphy.com/v1/gifs/trending?limit=1&api_key=$KEY"; fi
# URL via stdin config, not argv, so the key never shows up in the process list.
code=$(printf 'url = "%s"\n' "$URL" | curl -s -o /dev/null -w '%{http_code}' -K -)
if [ "$code" != 200 ]; then echo "$P rejected that key (HTTP $code). Nothing changed." >&2; exit 1; fi
umask 077
grep -vE '^(KLIPY_API_KEY|GIPHY_API_KEY)=' .env > .env.new; printf '%s=%s\n' "$VAR" "$KEY" >> .env.new; mv .env.new .env
unset KEY URL
docker compose up -d vybe-api >/dev/null
echo "$P key OK. Saved. GIFs are on."
