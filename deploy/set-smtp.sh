#!/usr/bin/env bash
# Set Gmail SMTP for the API without the app password touching shell history or the screen:
#   ~/vybe/deploy/set-smtp.sh
set -euo pipefail
cd "$(dirname "$0")"

read -r -p "Gmail address [supportadmin.vybe@gmail.com]: " GM
GM=${GM:-supportadmin.vybe@gmail.com}
read -rs -p "App password (16 letters, hidden): " AP; echo
AP=${AP// /}
if ! [[ $AP =~ ^[a-zA-Z]{16}$ ]]; then echo "That was ${#AP} characters, expected 16 letters. Nothing changed." >&2; exit 1; fi

umask 077
grep -vE '^(SMTP_URL|MAIL_FROM)=' .env > .env.new
printf 'SMTP_URL=smtps://%s:%s@smtp.gmail.com:465\nMAIL_FROM="Vybe <%s>"\n' "${GM/@/%40}" "$AP" "$GM" >> .env.new
mv .env.new .env
unset AP

docker compose up -d vybe-api >/dev/null
docker compose exec -T vybe-api node --input-type=module -e '
import nodemailer from "nodemailer";
await nodemailer.createTransport(process.env.SMTP_URL).verify();
console.log("Gmail login OK. Saved.");
' 2>&1 | grep -E "Gmail login OK|Invalid login|Error:" | head -2
