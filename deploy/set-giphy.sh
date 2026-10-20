#!/usr/bin/env bash
# Store the GIPHY API key for chat GIFs without it touching shell history or the screen:
#   ~/vybe/deploy/set-giphy.sh
set -euo pipefail
cd "$(dirname "$0")"
read -rs -p "GIPHY API key (hidden): " KEY; echo
KEY=${KEY// /}
if ! [[ $KEY =~ ^[A-Za-z0-9]{20,64}$ ]]; then echo "That doesn't look like a GIPHY key (${#KEY} characters). Nothing changed." >&2; exit 1; fi
# URL via stdin config, not argv, so the key never shows up in the process list.
code=$(printf 'url = "https://api.giphy.com/v1/gifs/trending?limit=1&api_key=%s"\n' "$KEY" | curl -s -o /dev/null -w '%{http_code}' -K -)
if [ "$code" != 200 ]; then echo "GIPHY rejected that key (HTTP $code). Nothing changed." >&2; exit 1; fi
umask 077
grep -v '^GIPHY_API_KEY=' .env > .env.new; printf 'GIPHY_API_KEY=%s\n' "$KEY" >> .env.new; mv .env.new .env
unset KEY
docker compose up -d vybe-api >/dev/null
echo "GIPHY key OK. Saved. GIFs are on."
