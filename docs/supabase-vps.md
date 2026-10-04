# Spamset Supabase on the VPS

Spamset has two self-hosted Supabase stacks on the Hostinger VPS (`srv1826492.hstgr.cloud`,
187.124.30.77), next to Loadout's and fully separate from them:

| Environment | Used by | URL (`app.config.ts`) |
| --- | --- | --- |
| `dev-spamset` | local development, `development` and `preview` builds | `https://dev-api.spamset.example` (TODO) |
| `prod-spamset` | `production` builds | `https://api.spamset.example` (TODO) |

The VPS runs Caddy in front of each stack's Kong gateway. Copy whatever layout `dev-loadout`
uses on the server (directory, compose project, Caddy file) and change the names, ports and
secrets as below. Never reuse a Loadout stack, its database, or its keys.

## 1. DNS

Point both hostnames (A record) at `187.124.30.77`.

## 2. Create each stack

On the VPS, once per environment (`dev-spamset`, then `prod-spamset`):

```sh
git clone --depth 1 https://github.com/supabase/supabase /tmp/supabase
mkdir -p /opt/dev-spamset && cp -r /tmp/supabase/docker/* /opt/dev-spamset/
cd /opt/dev-spamset && cp .env.example .env
```

In `.env`:

- New secrets for this stack: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`
  (generate the keys from the JWT secret as the Supabase self-hosting guide describes),
  `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`.
- Ports that no other stack on the VPS uses: `KONG_HTTP_PORT`, `KONG_HTTPS_PORT`,
  `POSTGRES_PORT`, `POOLER_PROXY_PORT_TRANSACTION`, `STUDIO_PORT`.
- `API_EXTERNAL_URL` and `SUPABASE_PUBLIC_URL`: the stack's https URL.
- `SITE_URL`: the web origin. `ADDITIONAL_REDIRECT_URLS=spamset://auth-callback,<web origin>`.

Start it under its own compose project name so containers and volumes stay separate:

```sh
docker compose -p dev-spamset up -d
```

## 3. Caddy

Add a site block per stack that proxies to its Kong port, then reload Caddy:

```
dev-api.spamset.example {
    reverse_proxy localhost:<KONG_HTTP_PORT>
}
```

Check: `curl https://dev-api.spamset.example/auth/v1/health` returns 401 without a key and 200
with `-H "apikey: <ANON_KEY>"`.

## 4. Sign-in providers

Self-hosted Supabase has no providers page; set them in the stack's `.env` and pass them
through to the `auth` service in `docker-compose.yml`:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://<stack host>/auth/v1/callback
GOTRUE_EXTERNAL_APPLE_ENABLED=true
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=<Services ID>,com.cjohnd.spamset
GOTRUE_EXTERNAL_APPLE_SECRET=<client secret JWT>
GOTRUE_EXTERNAL_APPLE_REDIRECT_URI=https://<stack host>/auth/v1/callback
```

Register `https://<stack host>/auth/v1/callback` in Google Cloud and Apple Developer. Restart
with `docker compose -p dev-spamset up -d`.

## 5. Schema

Apply `supabase/migrations/*.sql` in order, from Studio's SQL editor or with `psql` against the
stack's Postgres port. Apply to `dev-spamset` first; touch `prod-spamset` only deliberately.

## 6. Wire the app

1. Put the real hostnames in `SUPABASE_URL` (`app.config.ts`), `eas.json` and `.env.example`.
2. Put each stack's `ANON_KEY` in `eas.json` (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and the
   dev one in `.env.local`. It is public; the `SERVICE_ROLE_KEY` never goes in the app.
