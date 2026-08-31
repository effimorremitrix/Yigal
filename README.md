# Tidelane — Container Shipping Management Demo

A full-stack demo of a BuyCo-style ocean freight platform ("Command your container shipping") under an original neutral brand. React SPA + Cloudflare Worker API + D1 (SQLite) database, all served by a single worker.

Live: https://yigal.effi-mor-e04.workers.dev/

## Modules

- **Control Tower dashboard** — KPIs, exceptions, arrivals, activity feed, volume chart
- **Shipments** — searchable table → detail with milestone timeline, containers, documents (approve), parties, comment thread
- **New Booking** — 4-step wizard that persists a real shipment to the database
- **Track & Trace** — offline SVG world map with vessel positions along real trade-lane routes
- **Documents** — cross-shipment registry with filters
- **Analytics** — TEU volume, carrier allocation, on-time vs target, CO₂ by lane
- **Settings** — profile, preferences (timezone, date format, landing page, notifications); admin tab for user management
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

- `worker/` — module worker: hand-rolled router, PBKDF2 password hashing (Web Crypto), HttpOnly-cookie sessions in D1, ~16 JSON endpoints under `/api/*`. Static assets served by the same worker (`run_worker_first` keeps `/api` out of the SPA fallback).
- `migrations/` — `0001_schema.sql` (DDL) + `0002_seed.sql` (**generated** — 18 orgs, 7 users, 42 shipments). Regenerate with `npm run seed:generate`; the output is byte-stable (seeded PRNG, fixed date anchor, email-derived salts). A regenerated seed requires a wiped/recreated database. Never edit an applied migration file.
- `src/` — React 19 + Vite + Tailwind v4. `AuthContext` (login/session/settings) + `DataContext` (shipments via API, async mutations). The worker imports `src/types.ts` and `src/data/constants.ts` directly, so client and server share one domain model.

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

Covers: login/logout + bad password, viewer read-only gating, partner org scoping (incl. direct-URL denial), settings persistence, booking + comment + approval persisting across reload, and the public user guide.

## Deploy

The repo is connected to **Cloudflare Workers Builds**: every push deploys automatically. `wrangler.jsonc` declares `build.command = "npm run build"`, so wrangler builds the SPA itself before deploying — CI needs no extra build configuration, and `npm run deploy` works the same locally.

**One-time setup** (already done for this deployment): create the D1 database and seed it —

```bash
npx wrangler login
npx wrangler d1 create tidelane      # put the printed database_id into wrangler.jsonc
npm run db:migrate:remote            # applies schema + seed to the remote D1 (run once, before first deploy)
```

CI does not run migrations; after changing `migrations/`, run `npm run db:migrate:remote` manually. A regenerated seed requires wiping/recreating the remote database.
