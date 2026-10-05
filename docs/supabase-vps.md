# Spamset Supabase on the VPS

Spamset runs self-hosted Supabase on the Hostinger VPS (`srv1826492.hstgr.cloud`, 187.124.30.77):

| Environment | Used by | URL (`app.config.ts`) | Directory | Ports (loopback) |
| --- | --- | --- | --- | --- |
| `dev-spamset` | local development, `development` and `preview` builds | `https://spamset-dev.loadoutlog.com` | `/root/dev-spamset` | 28000, 28443, 25432, 26543 |
| `prod-spamset` | `production` builds | `https://spamset-api.loadoutlog.com` | `/root/prod-spamset` | 38000, 38443, 35432, 36543 |

The same server holds Loadout's stacks, shelved (stopped, data kept): `/root/supabase`
(prod-loadout, `api.loadoutlog.com`) and `/root/dev-loadout`. Never reuse or modify them. The
shared HTTPS proxy, `supabase-caddy`, lives in the `/root/supabase` compose project and must keep
running; its Caddyfile is `/root/supabase/docker/Caddyfile`, and stacks reach it over the
external `loadout-proxy` network.

## Create a stack

1. DNS (Cloudflare): an `A` record for the host pointing at `187.124.30.77`, **DNS only**
   (grey cloud), so Caddy can issue the certificate itself.
2. Run the setup script. It refuses to touch anything that exists, adds 2 GB swap once, builds
   the stack from the Supabase checkout already on the server (same versions as Loadout, none of
   its data), generates fresh secrets, starts it, appends the Caddy route and prints the public
   keys. Secrets stay in `/root/<stack>/.env`.

   ```sh
   scp tools/vps/setup-stack.sh root@187.124.30.77:/root/
   ssh root@187.124.30.77 'bash /root/setup-stack.sh dev-spamset spamset-dev.loadoutlog.com 2'
   ```

3. Apply the migrations in order (on an existing stack, only the ones it doesn't have yet):

   ```sh
   for f in supabase/migrations/*.sql; do
     scp "$f" root@187.124.30.77:/root/dev-spamset/
     ssh root@187.124.30.77 "docker exec -i dev-spamset-db sh -c 'PGPASSWORD=\$POSTGRES_PASSWORD psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1' < /root/dev-spamset/$(basename "$f")"
   done
   echo "notify pgrst, 'reload schema';" | ssh root@187.124.30.77 "docker exec -i dev-spamset-db sh -c 'PGPASSWORD=\$POSTGRES_PASSWORD psql -h localhost -U postgres -d postgres'"
   ```

   The last line makes the REST API see new functions (otherwise `rpc/...` returns 404 until a
   restart).

4. Put the printed `ANON_KEY` in `eas.json` (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` of the
   matching profiles) and, for dev, in `.env.local`. It is public; never put `SERVICE_ROLE_KEY`
   or `SUPABASE_SECRET_KEY` in the app.

Check: `curl https://<host>/auth/v1/health` returns 401 without a key and 200 with
`-H "apikey: <ANON_KEY>"`.

Studio is served at `https://<host>/` behind basic auth (`DASHBOARD_USERNAME` /
`DASHBOARD_PASSWORD` in the stack's `.env`).

## Sign-in providers

Self-hosted Supabase has no providers page. The script wires Google and Apple into the `auth`
service, switched off. To enable one, set these in `/root/<stack>/.env` and run
`docker compose up -d auth` in that directory:

```
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_SECRET=...
APPLE_ENABLED=true
APPLE_CLIENT_ID=<Services ID>,com.cjohnd.spamset
APPLE_SECRET=<client secret JWT>
```

Register `https://<host>/auth/v1/callback` as the redirect URL in Google Cloud and Apple
Developer. Allowed app redirects (`ADDITIONAL_REDIRECT_URLS`): `spamset://**`, `exp://**`,
`http://localhost:8081/**`.

Both stacks have Google and Apple enabled (2026-10-05). The scripts below write the secrets
over stdin without printing them, back up `.env` first and restart `auth`:

- **Google**: Google Cloud project `spamset`, Web clients "Spamset Dev" and "Spamset Prod", each
  with its own stack's callback. Download a client's JSON and run
  `tools/vps/set-google.sh <stack> <client_secret_....json>`.
- **Apple**: team `9437W69826`, App ID `com.cjohnd.spamset` (Sign In with Apple, Push), Services
  ID `com.cjohnd.spamset.signin` (both hosts and callbacks), Sign in with Apple key
  `WQD7KDA282`. `tools/vps/set-apple.sh WQD7KDA282 <AuthKey_WQD7KDA282.p8>` signs a new client
  secret for both stacks. **It expires after 180 days (current one: 2027-04-03); rerun before.**
  Keep the `.p8` outside the repo; Apple lets you download it only once.

## Day to day

```sh
cd /root/dev-spamset && docker compose ps        # status
docker compose logs -f auth                      # sign-in logs
docker compose restart                           # restart the stack
```
