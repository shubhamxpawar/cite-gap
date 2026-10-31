# Deploying CiteGap on Synteq

CiteGap is a Next.js 15 app (standalone output) that needs **one external Postgres** and
**no provider API keys** — `ENABLE_MOCK_ENGINE=1` makes the demo work offline. The image is
built from the repo `Dockerfile`; migrations run from the image with
`node scripts/migrate.mjs`.

Everything below is written to be copy-pasteable. Commands marked **[confirm]** place an
order or change billing — run those only after the account owner agrees.

---

## 0. What the app needs

| Requirement | Value |
|---|---|
| Runtime | Docker image (this repo's `Dockerfile`, Next.js standalone) |
| Port | `3000` |
| Health check | `GET /api/health` → `200` only when Postgres is reachable |
| Database | One Postgres 15+ URL (`DATABASE_URL`), reachable from Synteq's shared egress IP |
| Persistent state | **Postgres only** — the app's root filesystem is ephemeral |
| Env vars | `DATABASE_URL`, `SESSION_SECRET`, `ENABLE_MOCK_ENGINE=1`, `APP_URL` |

The app never writes to disk at runtime: reports, runs, and the `[DEMO]` workspace all live in
Postgres, and public sample reports are generated in-process (see `docs/decisions.md` D11).

---

## 1. Sign in to Synteq

```sh
npx -y synteq login              # browser device flow
# or headless:
# echo "$SYNTEQ_API_TOKEN" | npx -y synteq login --with-token
npx -y synteq whoami
```

Create the API key at <https://cloud.synteq.com/organization/api-keys> if you need headless
auth.

---

## 2. Choose the Postgres

Synteq Apps have no managed database and no persistent disk, so Postgres must live elsewhere.

### Option A — external managed Postgres (recommended for the demo)

Neon, Supabase, Railway, or any Postgres 15+ with a public hostname. Use the **pooled /
connection-string** URL and keep `?sslmode=require` if the provider asks for it.

```sh
export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require'
# optional: the unpooled URL, used by migrations when the provider offers one
export DIRECT_URL='postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require'
```

The app detects transaction-mode poolers (Supabase `:6543`, Neon `-pooler`, PgBouncer `:6432`)
and turns postgres.js prepared statements off automatically, because poolers drop session state
(`src/server/db/connection.ts`). Override with `PG_PREPARE=0` if your provider needs it anyway,
and cap the per-replica pool with `PG_POOL_MAX` (default 3 pooled / 5 direct).

Nothing to provision on Synteq. This is the fastest path and survives app redeploys.

### Option B — Postgres on a Synteq VPS **[confirm]**

Only if you want everything inside Synteq. This creates a **paid** VPS (order flow) and is not
covered by the free app tier. Ask before ordering, then:

```sh
npx -y synteq vps order --help   # inspect the current order flags first
```

On the VPS, run Postgres in Docker bound to the private interface, and allow the Synteq app
egress. Synteq Apps share one egress IP per location, so source-IP firewalling needs a support
ticket — the simplest safe setup is:

```sh
# on the VPS
docker run -d --name citegap-pg --restart unless-stopped \
  -e POSTGRES_PASSWORD='<strong-password>' \
  -e POSTGRES_DB=citegap \
  -p 5432:5432 -v citegap-pg:/var/lib/postgresql/data postgres:17-alpine
```

```sh
export DATABASE_URL='postgres://postgres:<strong-password>@<vps-public-ip>:5432/citegap'
```

Tunnel from your laptop for the one-time seed: `ssh -L 5432:127.0.0.1:5432 root@<vps-ip>`.

---

## 3. Create the app

Portal: **Apps → New App**, name `cite-gap`, source **Connect GitHub**
(`shubhamxpawar/cite-gap`, branch `master`), Dockerfile mode, location closest to the database.

CLI equivalent:

```sh
# from the repo root
npx -y synteq deploy --create cite-gap --dir . --no-wait
npx -y synteq link                # link this folder to the app for later commands
```

`deploy --create` is the scripted first-run walkthrough: it creates the app on the free plan
(card/PayPal on file required, not charged) and triggers the first build. The first release
will fail its health gate until `DATABASE_URL` is set — that is expected; continue to step 4
and redeploy.

---

## 4. Environment variables

Set these on the app (portal **Environment**, or CLI). `DATABASE_URL` and `SESSION_SECRET`
are secrets; the rest are config.

```sh
npx -y synteq app env add cite-gap "DATABASE_URL=$DATABASE_URL" --kind secret --scope runtime
npx -y synteq app env add cite-gap "SESSION_SECRET=$(openssl rand -hex 32)" --kind secret --scope runtime
npx -y synteq app env add cite-gap "ENABLE_MOCK_ENGINE=1" --kind config --scope runtime
npx -y synteq app env add cite-gap "APP_URL=https://cite-gap.synteq.app" --kind config --scope runtime
npx -y synteq app env add cite-gap "NODE_ENV=production" --kind config --scope runtime
```

Optional (only if you later add real keys — none are required):

| Key | Effect |
|---|---|
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `GEMINI_API_KEY` | enables that live engine |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | runs jobs on real Inngest instead of in-process dispatch |
| `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | enables sample-report abuse protection |

Database and pool tuning:

| Key | Effect |
|---|---|
| `ENABLE_MOCK_ENGINE=1` | **required** for the no-key demo; without it the run pipeline has no engine to call and the demo pages show empty runs |
| `DIRECT_URL` (optional) | unpooled URL used by `scripts/migrate.mjs` when `DATABASE_URL` is a pooler |
| `PG_PREPARE=0` (optional) | force prepared statements off when a pooler is not auto-detected |
| `PG_POOL_MAX` (optional) | per-replica connection cap (default 3 pooled / 5 direct) |

---

## 5. Build & deploy settings

```sh
npx -y synteq app settings set cite-gap \
  --port 3000 \
  --health-check-path /api/health \
  --pre-deploy-command "node scripts/migrate.mjs" \
  --dockerfile-path Dockerfile \
  --auto-deploy off
```

| Setting | Why |
|---|---|
| Port `3000` | matches `EXPOSE 3000` / `server.js` |
| Health `/api/health` | 503 when Postgres is unreachable, so a bad `DATABASE_URL` never takes traffic |
| Pre-deploy `node scripts/migrate.mjs` | applies `scripts/migrations/*.sql` once per release, tracked in `_migrations`; idempotent. Uses `DIRECT_URL` when set, otherwise `DATABASE_URL` |
| Auto-deploy off | demo deploys are deliberate |

The pre-deploy command runs inside the built image, which ships `scripts/` and the `postgres`
client (see `Dockerfile`).

---

## 6. Deploy, migrate, seed

```sh
# from this folder (gitignore excludes .next, node_modules, pgdata)
npx -y synteq deploy --app cite-gap --dir .

# or connect the GitHub repo in the portal and push to master / click Deploy
# (recommended for the full history and no upload size limit)
```

The pre-deploy command applies the schema before traffic shifts. Then seed the demo data
**once** from a machine that can reach the database:

```sh
DATABASE_URL="$DATABASE_URL" npm run db:seed
```

`npm run db:seed` is idempotent: it replaces the `[DEMO] Acme CRM` workspace, its 12 prompts,
4 backdated runs, 12 tracked pages, snapshots, 3 fix reports (including a verified win), and
3 warm public sample reports. It never touches other workspaces.

Demo login after seeding: `demo@citegap.dev` / `demo1234` (see `README.md`).

---

## 7. Verify

```sh
npx -y synteq app health cite-gap
curl -s https://cite-gap.synteq.app/api/health | jq
# {"status":"ok","service":"cite-gap","db":"ok","mockEngine":true,...}

curl -s -o /dev/null -w '%{http_code}\n' https://cite-gap.synteq.app/           # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cite-gap.synteq.app/login      # 200
curl -s -o /dev/null -w '%{http_code}\n' https://cite-gap.synteq.app/pricing    # 200
```

Then sign in as the demo user and check: dashboard meters, a run detail, a fix report
(`/app/fixes`), and the public sample flow on `/` (POST `/api/sample` → `/sample/<id>`).

Live logs: `npx -y synteq app logs cite-gap -f`.

---

## 8. Redeploys and rollback

- Push to `master` and deploy from GitHub, or `npx -y synteq deploy --app cite-gap --dir .`.
- Migrations are additive and tracked; a redeploy re-runs only new files.
- The demo seed is **not** part of the pre-deploy command (it would reset demo data on every
  release). Run it manually only when you want a fresh demo.
- Rollback: `npx -y synteq app deployment list cite-gap`, then
  `npx -y synteq app deployment rollback --to <n> --yes`. Env vars are read fresh; the image
  is reused.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Release ends **Health failed** | `/api/health` returned 503 → `DATABASE_URL` wrong or DB not reachable from Synteq egress. `curl` the URL from a laptop and check `synteq app logs`. |
| Health 200 but pages 500 | Schema not applied. Check the pre-deploy log, or run `DATABASE_URL=... node scripts/migrate.mjs` manually. |
| `relation "users" does not exist` | Migration `0001_init.sql` did not run; the `auth.users` shim is created by it. |
| `prepared statement "s1" does not exist` / `bind message supplies 0 parameters` | You are behind a transaction-mode pooler that was not auto-detected. Set `PG_PREPARE=0`, and point migrations at the direct URL with `DIRECT_URL`. |
| Dashboard empty after deploy | Seed not run. Run `npm run db:seed` against the production `DATABASE_URL`. |
| `connect ECONNREFUSED` in health `detail` | DB host/port wrong, or the VPS firewall blocks Synteq's shared egress (open a support ticket). |
| Build fails: `DATABASE_URL` missing | It is not needed at build time; make sure the build is using the repo `Dockerfile`, not Railpack. |
| CLI reports source too large | Deploy from GitHub, or `rm -rf .next` before `synteq deploy --dir .`. |
| App writes fail / read-only filesystem | Nothing should write to disk. If a dependency does, point its cache at `os.tmpdir()`. |

---

## 10. Security notes for the demo

- `SESSION_SECRET` is a real signing secret — generate it per environment, never reuse the
  local `dev-only-secret-rotate-me`.
- `ENABLE_MOCK_ENGINE=1` produces **synthetic** data. Every demo surface is labelled; keep the
  README warning and do not present mock output as a real audit.
- No secrets are committed: `.env*` is gitignored and `.env` files never ship with
  `synteq deploy`.
- Public sample reports are rate-limited to 3/day per IP hash in production; add Turnstile if
  the demo gets traffic.
