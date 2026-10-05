#!/usr/bin/env bash
# Enable Sign in with Apple on both Spamset stacks.
#   tools/vps/set-apple.sh <KEY_ID> [p8 path] [services id]   (Key ID WQD7KDA282, created 2026-10-05)
# Builds the client-secret JWT (ES256, valid ~6 months, Apple's maximum) from the .p8 and writes
# APPLE_ENABLED / APPLE_CLIENT_ID / APPLE_SECRET to each stack's .env over stdin, then restarts
# auth. Nothing secret is printed. Rerun with the same .p8 before the printed expiry date.
set -euo pipefail

KEY_ID=${1:?Key ID (10 characters) from the Apple developer portal}
P8=${2:-$(ls ~/Desktop/AuthKey_"$KEY_ID".p8)}
SERVICES_ID=${3:-com.cjohnd.spamset.signin}
TEAM_ID=9437W69826
BUNDLE_ID=com.cjohnd.spamset
CLIENT_IDS="$SERVICES_ID,$BUNDLE_ID"

SECRET=$(KEY_ID=$KEY_ID TEAM_ID=$TEAM_ID SUB=$SERVICES_ID P8=$P8 node -e '
  const crypto = require("crypto"), fs = require("fs");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: process.env.KEY_ID });
  const body = b64({ iss: process.env.TEAM_ID, iat: now, exp: now + 180 * 86400,
                     aud: "https://appleid.apple.com", sub: process.env.SUB });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body),
    { key: fs.readFileSync(process.env.P8), dsaEncoding: "ieee-p1363" }).toString("base64url");
  process.stdout.write(head + "." + body + "." + sig);
')

for STACK in prod-spamset dev-spamset; do
  echo "## $STACK"
  printf '%s\n%s\n' "$CLIENT_IDS" "$SECRET" | ssh root@187.124.30.77 "set -e; cd /root/$STACK
    read -r IDS; read -r SECRET
    cp .env .env.bak-$(date +%F)
    awk -v ids=\"\$IDS\" -v s=\"\$SECRET\" '
      /^APPLE_ENABLED=/   {print \"APPLE_ENABLED=true\"; next}
      /^APPLE_CLIENT_ID=/ {print \"APPLE_CLIENT_ID=\" ids; next}
      /^APPLE_SECRET=/    {print \"APPLE_SECRET=\" s; next}
      {print}' .env > .env.new
    chmod --reference=.env .env.new && mv .env.new .env
    grep '^APPLE_\(ENABLED\|CLIENT_ID\)=' .env
    docker compose up -d auth 2>&1 | tail -1"
done

echo "Apple client secret expires $(date -d '+180 days' +%F); rerun this script before then."
