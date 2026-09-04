# Telegram-First Multistore Commerce

A production-ready multilingual **multistore commerce platform** powered by
Telegram. It supports **TON and manual payments**, **digital and physical
products**, **referrals/affiliates and sales commissions**, **automated
fulfillment**, **analytics**, **SEO**, and runs cleanly on **Railway** from a
GitHub repository.

The project is designed for a near one-click Railway experience:

```
GitHub → Railway → Build → PostgreSQL connect → Migrations run → App starts → First-run setup
```

---

## Architecture

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22 (ESM) |
| Language | TypeScript (strict) |
| HTTP framework | **Hono** (`@hono/node-server`) |
| Database | **PostgreSQL** with **plain-SQL migrations** (no ORM, no native binaries) |
| Payments | TON on-chain verification + manual payment/receipt review |
| Telegram | Per-store Telegram bot + master bot webhook routing |
| Storage | S3-compatible object storage **or** a local Railway volume |
| Background jobs | `node-cron` scheduler (inline within the web service, or a separate worker) |
| Backups | `pg_dump` logical backups to S3 or a volume |

**Key directories**

```
migrations/      Clean, numbered SQL migrations (forward-only).
src/config/      Validated environment configuration (fail-fast diagnostics).
src/lib/         Logger, crypto/JWT, slug, errors.
src/db/          pg connection pool + transaction helpers.
src/services/    Domain logic: store, user, product, order, payment, ton, telegram,
                 storage, backup, scheduler.
src/routes/      Hono routes: storefront, auth, telegram webhooks, admin, health.
src/views/       Server-rendered storefront (Hono JSX).
scripts/         migrate, seed, check-env.
```

---

## Requirements

- **Node.js ≥ 20** for local development.
- **PostgreSQL** (14+) for local development. Railway provides a managed
  Postgres service in production.
- A **Telegram Bot token** (from @BotFather) for the bot integration.
- Optional: S3-compatible object storage for durable file storage, and a TON
  API key for on-chain payment verification.

---

## Local development

```bash
git clone <repo>
cd Telegram-First-Multistore-Commerce
cp .env.example .env       # edit DATABASE_URL and set APP_SECRET
npm install
npm run migrate            # apply the SQL migrations to your local DB
npm run dev                # start the web service (tsx watch)
```

Other useful commands:

```bash
npm run typecheck          # TypeScript type check
npm run lint               # ESLint
npm run test               # Vitest unit tests
npm run build              # compile to dist/
npm run start              # run the compiled production server
npm run start:worker       # run the background worker (separate service)
npm run db:seed            # DEV-only demo seed (never runs in production)
npm run env:check          # print a configuration diagnostic
```

> The demo seed (`db:seed`) **refuses to run in production** (`NODE_ENV=production`)
> unless you explicitly set `ALLOW_SEED=true`. Production data is created via the
> **first-run setup flow**, never a seed command.

---

## Environment variables

See **[.env.example](.env.example)** for the complete, annotated reference. The
config fails fast with a clear diagnostic when required production variables are
missing.

**Required (project-specific)**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string. On Railway use `${{Postgres.DATABASE_URL}}` or the Postgres service internal URL. |
| `APP_SECRET` | Long random string signing JWT/bot tokens (e.g. `openssl rand -hex 32`). |
| `APP_URL` | Public URL (no trailing slash). Railway auto-derives from `RAILWAY_PUBLIC_DOMAIN` if omitted. |

**Optional / feature-level** — configure only what you use (Telegram, TON, S3,
SMTP, backups). See `.env.example`.

---

## Railway deployment

1. **Create a Railway project** from your GitHub repo (or connect the repo).

2. **Add a PostgreSQL service** (Railway → New → Database → PostgreSQL).

3. **Connect the database** to the app: add a service variable
   `DATABASE_URL=${{Postgres.DATABASE_URL}}` (or paste the Postgres service's
   internal connection URL).

4. **Add project-specific variables**: `APP_SECRET` and `APP_URL` are the only
   strictly required ones. `APP_URL` defaults to `https://<service>.up.railway.app`.

5. **Deploy.** Railway builds the Docker image, runs **forward-only migrations**
   (`node dist/scripts/migrate.js`), then starts the web service
   (`node dist/src/index.js`). The health check polls `/health`.

6. **Open the app** and complete the **first-run setup**:
   register your admin account → your store is created → add products → connect
   your Telegram bot and payments.

`railway.toml` configures the build and start commands so no manual command
configuration is needed.

### Mounting a volume (recommended)

If you are **not** using S3, add a **Volume** to the web service and set
`STORAGE_DIR=/app/storage` so uploaded receipts/products/backups survive
redeploys.

### Scaling: separate worker

By default the scheduler (TON payment polling + periodic backups) runs **inside**
the web service. For scale, create a **second service** from the same repo, set
`ENABLE_INLINE_WORKER=false` on the web service, and run
`node dist/src/worker.js` in the second service.

---

## Database

- Migrations are **plain SQL** files in `migrations/`, applied by
  `scripts/migrate.ts` (compiled to `dist/scripts/migrate.js`).
- The runner is **forward-only** and **idempotent**; each file runs once, inside
  its own transaction, and is recorded in a `_migrations` ledger table.
- It never drops or resets existing production data. Never edit an applied
  migration; add a new numbered file.

```bash
npm run migrate        # dev
npm run migrate:prod   # production (compiled)
```

---

## Telegram

1. Create a bot with **@BotFather** → `/newbot` → copy the token.
2. In the **admin dashboard**, add your store's bot token (or set the master
   `TELEGRAM_BOT_TOKEN` in the env var for a single default bot).
3. Click **Register webhook** in the dashboard (or call
   `POST /api/admin/webhook/register` with a valid admin JWT). The app registers
   `{APP_URL}/api/telegram/webhook/:storeSecret` over **HTTPS** with a secret
   token.
4. Set the **Main Admin Telegram ID** via the
   `SUPER_ADMIN_TELEGRAM_IDS` variable (comma-separated) so admins are
   recognized by their Telegram ID. You can get your numeric ID from a bot like
   @userinfobot (send it `/start`), or by checking the message sender
   `from.id` used in the bot logs.
5. Open your bot in Telegram and send `/start` to test.

The webhook routes updates per-store by webhook secret; unknown secrets return
`200` so Telegram never retries forever, and secret-token mismatches are
rejected with `403`.

---

## TON / payments

- `TON_NETWORK` defaults to `mainnet`. Set `TON_NETWORK=testnet` only for
  testing.
- `PAYMENT_DEV_MODE=true` **simulates** verification and is labelled as
  development-only. It is never enabled implicitly and should be **false** in
  production.
- `PAYMENT_ALLOW_TESTNET=true` allows testnet invoices during setup.
- Configure a TON provider (`TON_PROVIDER=toncenter|tonapi`) and `TON_API_KEY`
  for real on-chain verification.
- Invoices embed an order-specific **memo**. The worker polls the chain
  (`TON_POLL_INTERVAL_MS` or `TON_POLL_CRON`) and marks a payment paid only when
  an inbound transfer to the store address matching the memo/amount is found.

For **manual payments**, the operator enables the manual method; customers upload
a payment receipt, the order moves to **AWAITING_REVIEW**, and an admin approves
or rejects it in the dashboard. Receipts are stored in object/volume storage.

---

## File storage

- Configure S3-compatible storage via `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. This is recommended so files
  survive redeploys and scale across instances.
- Otherwise the app writes to a **local directory** (`STORAGE_DIR`), which must
  be a **Railway volume** for persistence. The app falls back to `<cwd>/storage`
  if the configured dir isn't writable.

---

## Scheduled jobs

The scheduler (`node-cron`) runs:

- **TON payment polling** — every `TON_POLL_INTERVAL_MS` (default 15s) or on
  `TON_POLL_CRON` if set.
- **Database backups** — on `BACKUP_CRON` (default `0 3 * * *`).

Jobs are guarded so overlapping runs never stack. Run inline
(`ENABLE_INLINE_WORKER=true`) or in a dedicated worker service.

---

## Backup

`pg_dump` creates a full logical dump (`--no-owner`) gzipped to S3
(`BACKUP_S3=true`) or to a local volume. Every run is recorded in `BackupJob`.
To restore:

```bash
curl -L <backup-url> | gunzip | psql "$DATABASE_URL"
```

or, from a local file:

```bash
gunzip -c backups/<file>.sql.gz | psql "$DATABASE_URL"
```

Keep `BACKUP_RETENTION` backups (default 7). Store backups **outside** the
primary database so a database failure does not destroy your only copy.

---

## Custom domain

- Add your domain to the Railway service and Railway issues a TLS cert.
- Set `APP_URL=https://your-domain.com` in the service variables.
- Re-register the Telegram webhook (dashboard → Register webhook) so it points at
  the new public URL. This updates referral links, canonical URLs, sitemap and
  Open Graph URLs automatically because they all derive from `APP_URL`.

---

## Update workflow

1. Push changes to GitHub.
2. Railway detects the commit, rebuilds the Docker image, runs migrations
   (idempotent — new migration files are applied in order), and redeploys.
3. Existing data is never dropped. Add new migrations instead of editing old
   ones.

---

## Security notes

- `.env` is git-ignored; `.env.example` contains no real secrets.
- No hardcoded credentials in the repo.
- Auth uses short-lived JWTs; admin/Telegram webhook routes are protected.
- Logs redact secrets/tokens. Error responses never leak internal details.
- `PAYMENT_DEV_MODE` and `PAYMENT_ALLOW_TESTNET` are development conveniences and
  are off by default; production must keep them false.

---

## License

MIT
