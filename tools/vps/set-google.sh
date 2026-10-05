#!/usr/bin/env bash
# Enable Google sign-in on one Spamset stack from the OAuth client JSON downloaded from Google Cloud
# (project `spamset`; Web clients "Spamset Dev" and "Spamset Prod").
#   tools/vps/set-google.sh <dev-spamset|prod-spamset> <client_secret_....json>
# Writes GOOGLE_ENABLED / GOOGLE_CLIENT_ID / GOOGLE_SECRET to the stack's .env over stdin, then
# restarts auth. Nothing secret is printed.
set -euo pipefail

STACK=${1:?stack, dev-spamset or prod-spamset}
JSON=${2:?client_secret_....json downloaded from Google Cloud}
[[ $STACK == *-spamset ]] || { echo "Refusing: $STACK is not a Spamset stack"; exit 1; }

jq -r '.web.client_id, .web.client_secret' "$JSON" | ssh root@187.124.30.77 "set -e; cd /root/$STACK
  read -r ID; read -r SECRET
  cp .env .env.bak-\$(date +%F)
  awk -v id=\"\$ID\" -v s=\"\$SECRET\" '
    /^GOOGLE_ENABLED=/   {print \"GOOGLE_ENABLED=true\"; next}
    /^GOOGLE_CLIENT_ID=/ {print \"GOOGLE_CLIENT_ID=\" id; next}
    /^GOOGLE_SECRET=/    {print \"GOOGLE_SECRET=\" s; next}
    {print}' .env > .env.new
  chmod --reference=.env .env.new && mv .env.new .env
  grep '^GOOGLE_\(ENABLED\|CLIENT_ID\)=' .env
  docker compose up -d auth 2>&1 | tail -1"
