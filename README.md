# Tidelane — Container Shipping Management Demo

A full-stack demo of a BuyCo-style ocean freight platform ("Command your container shipping") under an original neutral brand. React SPA + Cloudflare Worker API + D1 (SQLite) database, all served by a single worker.

Live: https://yigal.effi-mor-e04.workers.dev/

## Modules

- **Control Tower dashboard** — KPIs, exceptions, arrivals, activity feed, volume chart
- **Shipments** — searchable table → detail with milestone timeline, containers, documents (approve), parties, comment thread
- **New Booking** — 4-step wizard that persists a real shipment to the database
- **Track & Trace** — offline SVG world map with vessel positions along real trade-lane routes
- **Documents** — cross-shipment registry with filters
- **Invoices** — customer invoices pulled from QuickBooks Online into the database: open receivables, overdue, paid, each linked to the shipment it bills (internal admin/ops only)
- **Analytics** — TEU volume, carrier allocation, on-time vs target, CO₂ by lane
- **Settings** — profile, preferences (timezone, date format, landing page, notifications); admin tabs for user management and **Integrations** (CBP ACE customs, E2open INTTRA, Intuit QuickBooks: enable/disable, mock/live, editable API credentials, connection test, QuickBooks sign-in)
- **User Guide** (`/guide`) — demo accounts, permission matrix, module walkthrough; readable before login

## Users, roles & organizations

Two-axis access control, enforced by the API:

- **Role tiers**: `admin` (everything + user management) · `ops` (book, approve, comment) · `viewer` (read-only)
- **Organization scoping**: users belong to an organization (`internal`, `shipper`, `forwarder`, `consignee`, `carrier`). Internal users see all shipments; partner users only see shipments where their org is a party.

### Demo accounts (password for all: `tidelane-demo`)

| Email | Role | Organization |
|---|---|---|
| effi@tidelane.demo | admin | Tidelane (internal) |
| ops@tidelane.demo | ops | Tidelane (internal) |
| viewer@tidelane.demo | viewer | Tidelane (internal) |
| dana@atlaspolymers.demo | ops | Atlas Polymers (shipper) |
| amit@globalfreight.demo | ops | GlobalFreight Partners (forwarder) |
| pieter@northline.demo | viewer | Northline Imports (consignee) |
| desk@meridianline.demo | ops | Meridian Line (carrier) |

## Architecture

- `worker/` — module worker: hand-rolled router, PBKDF2 password hashing (Web Crypto), HttpOnly-cookie sessions in D1, ~25 JSON endpoints under `/api/*`. `worker/integrations/` holds the external connectors (see below); `worker/invoices.ts` is the ledger the QuickBooks connector fills. Static assets served by the same worker (`run_worker_first` keeps `/api` out of the SPA fallback).
- `migrations/` — `0001_schema.sql` (DDL) + `0002_seed.sql` (**generated** — 18 orgs, 7 users, 42 shipments) + `0003_integrations.sql` (connector toggles) + `0004_integration_credentials.sql` (base-URL override + encrypted credentials) + `0005_quickbooks_invoices.sql` (QuickBooks provider row, OAuth state, last-sync columns, `invoices` table; recreates the two integration tables without the provider CHECK). Regenerate with `npm run seed:generate`; the output is byte-stable (seeded PRNG, fixed date anchor, email-derived salts). A regenerated seed requires a wiped/recreated database. Never edit an applied migration file.
- `src/` — React 19 + Vite + Tailwind v4. `AuthContext` (login/session/settings) + `DataContext` (shipments via API, async mutations). The worker imports `src/types.ts` and `src/data/constants.ts` directly, so client and server share one domain model.

## Integrations (ACE customs, INTTRA, QuickBooks)

Three external connectors are wired in as plumbing, each behind a feature flag with a deterministic mock adapter, so the app behaves the same until real credentials exist:

- **CBP ACE** (US customs): `GET /api/integrations/ace/shipments/:id/customs` returns ISF 10+2 / entry / release status for a shipment (`applicable: false` for non-US destinations).
- **E2open INTTRA** (ocean network): `GET /api/integrations/inttra/schedules?origin=&destination=&ready=` feeds the booking wizard; tracking events and booking submission are implemented in the adapter but not routed yet.
- **Intuit QuickBooks** (accounts receivable): `POST /api/integrations/quickbooks/invoices/sync` pulls every invoice from the connected company into the `invoices` table (upsert by vendor id, shipment linked by a `TL-2026-####` booking ref found in the doc number, memo or line descriptions) and records the last sync; `GET /api/invoices` reads the ledger with `open` / `overdue` / `paid` / `void` derived at read time. Both are limited to admin/ops users of the internal organization. The mock ledger bills one invoice per shipment to its shipper, consistent with the shipment's progress.

Design: `worker/integrations/registry.ts` is the only code that consumes secret values and decides live vs mock; a live adapter is never built without complete credentials. `worker/integrations/secrets.ts` is the only code that encrypts/decrypts them. Per-provider `client.ts` (live, typed fetch with timeout, vendor payload mappers) and `mock.ts` (seeded sample data). Admin endpoints: `GET /api/integrations`, `PUT /api/integrations/:provider` (`enabled`, `mode`), `PUT /api/integrations/:provider/credentials` (`baseUrl`, `secrets`), `POST /api/integrations/:provider/test`. Toggles, the base URL override, the last health check and the last data pull live in the D1 table `integration_settings`, encrypted credentials in `integration_credentials`; a disabled provider makes its domain endpoints return 503. Valid providers are enforced in `worker/integrations/provider.ts`, not by the database.

### Credentials

An admin sets the base URL and the vendor keys in **Settings → Integrations**, then switches the provider to **Live** and presses **Test connection** — no CLI, no redeploy. Values are encrypted with AES-GCM before they reach the database and are never returned by the API: `GET /api/integrations` reports presence, source (`db`/`env`) and the last four characters only. Clearing a saved key falls back to the deployment value.

That requires one master key, plus the optional deployment fallbacks:

```bash
cp .dev.vars.example .dev.vars              # local: fill in values, wrangler dev loads it
npx wrangler secret put CREDENTIALS_KEY     # required to store credentials from the UI (and for the QuickBooks sign-in)
npx wrangler secret put ACE_API_KEY         # optional fallbacks, overridden by anything saved in the UI
npx wrangler secret put INTTRA_CLIENT_ID
npx wrangler secret put INTTRA_API_KEY
npx wrangler secret put QUICKBOOKS_CLIENT_ID
npx wrangler secret put QUICKBOOKS_CLIENT_SECRET
```

Generate the master key with `openssl rand -base64 32` and keep it: rotating it makes every stored credential unreadable, which degrades the affected provider to mock (the UI shows *Stored, unreadable*) until the keys are re-entered. Fallback base URLs stay under `vars` in `wrangler.jsonc` (`ACE_BASE_URL`, `INTTRA_BASE_URL`, `QUICKBOOKS_BASE_URL`). The ACE and INTTRA live payload mappers throw an explicit "not implemented" error until the vendor specs are wired in, so keep those two in Mock mode until then. Which INTTRA modules we license, and what each one unblocks in the app, is scoped in [`docs/inttra-module-scope.md`](docs/inttra-module-scope.md).

### QuickBooks: two ways to connect

QuickBooks Online has no API key; it only speaks OAuth 2.0, so a live connection needs four values: `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` (from your app on developer.intuit.com), `QUICKBOOKS_REALM_ID` (the company id) and `QUICKBOOKS_REFRESH_TOKEN`. The base URL is `https://sandbox-quickbooks.api.intuit.com` or `https://quickbooks.api.intuit.com`.

1. **Sign in with Intuit** (recommended): save the base URL, client ID and secret on the QuickBooks card, register `https://<your-worker>/api/integrations/quickbooks/oauth/callback` as a redirect URI in the Intuit app (the card shows the exact value; locally it is `http://localhost:8787/...`, run it against the worker, not the Vite dev server), then press **Connect to QuickBooks**. The worker stores a single-use state for 10 minutes, Intuit returns the realm id and an authorization code, and the callback exchanges it and saves the realm id and refresh token encrypted. The page comes back with `?quickbooks=connected` (or `error&reason=...`).
2. **Paste the values**: get a realm id and refresh token from Intuit's OAuth 2.0 Playground and paste all four values into the card. Same result, no redirect.

Then switch Mode to **Live**, press **Test connection** (reports the connected company name) and pull invoices from the Invoices page. Access tokens live one hour and are cached per isolate; Intuit rotates the refresh token, and the worker writes the new one back encrypted under the acting user, which is why `CREDENTIALS_KEY` is required for anything beyond a local trial (an env-only refresh token cannot be updated and eventually fails with a "reconnect" message). Deleted invoices are not removed by a pull; voided ones show as `void`.

## Develop locally

```bash
npm install
npm run db:migrate:local     # create + seed the local D1 (in .wrangler/state)
npm run dev:worker           # wrangler dev → http://localhost:8787 (API + built SPA)
npm run dev                  # optional: Vite with HMR on :5173, proxying /api → :8787
npm run build                # type-check (app + worker + scripts) and bundle
```

`npm run db:reset:local` wipes local state and re-seeds.

## Test

```bash
npm run db:reset:local
CHROMIUM_PATH=/path/to/chromium npm run test:e2e   # omit CHROMIUM_PATH to use Playwright's own browser
```

Covers: login/logout + bad password, viewer read-only gating, partner org scoping (incl. direct-URL denial and no access to invoices), settings persistence, integrations admin (mock health check, kill switch, saving and clearing credentials with no secret leakage, deterministic schedules), the QuickBooks connect flow up to Intuit's door (authorize URL, single-use state, callback error handling, no outbound call) plus a mock invoice pull shown on the Invoices page, booking + comment + approval persisting across reload, and the public user guide.

## Deploy

The repo is connected to **Cloudflare Workers Builds**: every push deploys automatically. `wrangler.jsonc` declares `build.command = "npm run build"`, so wrangler builds the SPA itself before deploying — CI needs no extra build configuration, and `npm run deploy` works the same locally.

**One-time setup** (already done for this deployment): create the D1 database and seed it —

```bash
npx wrangler login
npx wrangler d1 create tidelane      # put the printed database_id into wrangler.jsonc
npm run db:migrate:remote            # applies schema + seed to the remote D1 (run once, before first deploy)
```

CI does not run migrations; after changing `migrations/`, run `npm run db:migrate:remote` manually (do this **before** pushing a change that adds a migration, e.g. `0005_quickbooks_invoices.sql`; until it is applied, saving QuickBooks settings or pulling invoices errors, the Invoices page shows an empty ledger, and the other connectors fall back to mock defaults). A regenerated seed requires wiping/recreating the remote database.
