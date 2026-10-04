#!/usr/bin/env bash
#
# Create one Spamset Supabase stack on the Hostinger VPS (see docs/supabase-vps.md).
#
#   scp tools/vps/setup-stack.sh root@187.124.30.77:/root/
#   ssh root@187.124.30.77 'bash /root/setup-stack.sh dev-spamset spamset-dev.loadoutlog.com 2'
#
# Arguments: <stack name> <public host> <port prefix digit>. Ports become 127.0.0.1:<p>8000 (Kong),
# <p>8443, <p>5432 and <p>6543 (pooler): prefix 2 for dev-spamset, 3 for prod-spamset.
#
# It never touches existing stacks: it refuses to run if the directory or containers exist, takes
# pristine files from the Supabase checkout already on the server (same versions as dev-loadout,
# no Loadout data), and only appends a site block to the shared Caddyfile (backed up first).
set -euo pipefail

NAME=${1:?stack name, e.g. dev-spamset}
HOST=${2:?public host, e.g. spamset-dev.loadoutlog.com}
P=${3:?port prefix digit, e.g. 2}
DIR=/root/$NAME
SOURCE=/root/dev-loadout/supabase          # Supabase git checkout (commit f8e682c4)
CADDYFILE=/root/supabase/docker/Caddyfile  # mounted into supabase-caddy
IP=187.124.30.77

log() { printf '\n== %s\n' "$*"; }

[[ $NAME == *-spamset ]] || { echo "Refusing: $NAME is not a Spamset stack"; exit 1; }
[[ ! -e $DIR ]] || { echo "Refusing: $DIR already exists"; exit 1; }
if docker ps -a --format '{{.Names}}' | grep -q "^$NAME-"; then echo "Refusing: $NAME containers exist"; exit 1; fi
if ss -ltn | grep -qE "127.0.0.1:${P}(8000|8443|5432|6543) "; then echo "Refusing: ports ${P}xxxx in use"; exit 1; fi

log "Swap (2 GB, once)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

log "Stock Supabase docker files -> $DIR"
tmp=$(mktemp -d)
git -C "$SOURCE" archive HEAD docker | tar -x -C "$tmp"
mv "$tmp/docker" "$DIR" && rmdir "$tmp"
cd "$DIR"

log "Compose: $NAME container names, loopback-only ports, Google and Apple sign-in"
sed -i \
  -e "s/^name: supabase$/name: $NAME/" \
  -e "s/container_name: supabase-/container_name: $NAME-/" \
  -e "s/container_name: realtime-dev.supabase-realtime/container_name: realtime-dev.$NAME-realtime/" \
  -e 's/- \${KONG_HTTP_PORT}:8000/- 127.0.0.1:${KONG_HTTP_PORT}:8000/' \
  -e 's/- \${KONG_HTTPS_PORT}:8443/- 127.0.0.1:${KONG_HTTPS_PORT}:8443/' \
  -e 's/- \${POSTGRES_PORT}:5432/- 127.0.0.1:${POSTGRES_PORT}:5432/' \
  -e 's/- \${POOLER_PROXY_PORT_TRANSACTION}:6543/- 127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543/' \
  -e 's/^      # GOTRUE_EXTERNAL_GOOGLE_/      GOTRUE_EXTERNAL_GOOGLE_/' \
  -e 's/^\(      GOTRUE_EXTERNAL_PHONE_ENABLED: .*\)$/\1\n      GOTRUE_EXTERNAL_APPLE_ENABLED: ${APPLE_ENABLED}\n      GOTRUE_EXTERNAL_APPLE_CLIENT_ID: ${APPLE_CLIENT_ID}\n      GOTRUE_EXTERNAL_APPLE_SECRET: ${APPLE_SECRET}\n      GOTRUE_EXTERNAL_APPLE_REDIRECT_URI: ${API_EXTERNAL_URL}\/auth\/v1\/callback/' \
  docker-compose.yml
# Kong reaches realtime by container name; realtime reads its tenant from the first label.
sed -i "s/realtime-dev.supabase-realtime/realtime-dev.$NAME-realtime/" volumes/api/kong.yml
# Kong joins the network Caddy is on, so Caddy can reach it as $NAME-kong.
cat > docker-compose.proxy.yml <<'EOF'
services:
  kong:
    networks:
      - default
      - loadout-proxy

networks:
  loadout-proxy:
    external: true
    name: loadout-proxy
EOF
grep -c "container_name: $NAME-\|container_name: realtime-dev.$NAME" docker-compose.yml

log "Environment and fresh secrets"
cp .env.example .env
setenv() {  # replace KEY=..., or append it
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*$|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
setenv COMPOSE_PROJECT_NAME "$NAME"
setenv COMPOSE_FILE docker-compose.yml:docker-compose.proxy.yml
setenv SUPABASE_PUBLIC_URL "https://$HOST"
setenv API_EXTERNAL_URL "https://$HOST"
setenv SITE_URL "spamset://"
setenv ADDITIONAL_REDIRECT_URLS "spamset://**,exp://**,http://localhost:8081/**"
setenv KONG_HTTP_PORT "${P}8000"
setenv KONG_HTTPS_PORT "${P}8443"
setenv POSTGRES_PORT "${P}5432"
setenv POOLER_PROXY_PORT_TRANSACTION "${P}6543"
setenv POOLER_TENANT_ID "$NAME"
setenv STUDIO_DEFAULT_PROJECT "$NAME"
setenv DISABLE_SIGNUP false
setenv ENABLE_EMAIL_SIGNUP false
setenv ENABLE_ANONYMOUS_USERS false
setenv ENABLE_PHONE_SIGNUP false
setenv GOOGLE_ENABLED false
setenv GOOGLE_CLIENT_ID ""
setenv GOOGLE_SECRET ""
setenv APPLE_ENABLED false
setenv APPLE_CLIENT_ID ""
setenv APPLE_SECRET ""
sh utils/generate-keys.sh --update-env > /dev/null
sh utils/add-new-auth-keys.sh --update-env > /dev/null
rm -f .env.old
chmod 600 .env

log "Start $NAME"
docker compose up -d
for i in $(seq 1 60); do
  unhealthy=$(docker ps --filter "label=com.docker.compose.project=$NAME" --format '{{.Names}} {{.Status}}' | grep -v '(healthy)' || true)
  [[ -z $unhealthy ]] && break
  sleep 5
done
docker ps --filter "label=com.docker.compose.project=$NAME" --format '{{.Names}}\t{{.Status}}'
[[ -z ${unhealthy:-} ]] || { echo "Not healthy yet:"; echo "$unhealthy"; exit 1; }

log "Caddy route https://$HOST"
if [[ $(getent ahostsv4 "$HOST" | awk 'NR==1{print $1}') != "$IP" ]]; then
  echo "SKIPPED: $HOST does not resolve to $IP yet. Add the DNS record, then re-run only this step:"
  echo "  see docs/supabase-vps.md (Caddy)"
elif grep -q "^$HOST {" "$CADDYFILE"; then
  echo "Already routed."
else
  cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%F-%H%M%S)"
  # Append (same inode) so the read-only bind mount in supabase-caddy sees the change.
  printf '\n%s {\n    reverse_proxy %s-kong:8000\n    log {\n        output stdout\n        format console\n    }\n}\n' "$HOST" "$NAME" >> "$CADDYFILE"
  docker exec supabase-caddy caddy reload --config /etc/caddy/Caddyfile
  sleep 10
  echo "health without key: $(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/auth/v1/health") (expect 401)"
fi

log "Done. Public keys for the app (secrets stay in $DIR/.env):"
grep -E '^(ANON_KEY|SUPABASE_PUBLISHABLE_KEY)=' .env
free -h
