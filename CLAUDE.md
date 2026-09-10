# CLAUDE.md — Tidelane

Context for any Claude Code session in this repo. Read this before touching anything.

## What this is

Tidelane is a container shipping management application. React 19 + Vite + Tailwind v4 SPA, a Cloudflare module Worker, and a D1 (SQLite) database, all served by one worker and deployed on every push via Cloudflare Workers Builds.

Live: https://yigal.effi-mor-e04.workers.dev/

Built for Yigal, who runs an ocean freight business in Los Angeles and is a long-standing friend of the owner's family. The owner is Effi Mor (Ephraim Mor), founder of RemitRix. The work is unpaid and there is no signed agreement. Yigal owns the delivered application outright; the underlying architecture patterns remain Effi's to reuse elsewhere.

## Read this before proposing anything

Yigal was quoted roughly USD 50,000 per year by BuyCo, and that is why he came to Effi. But when asked what would make him happy as a first step, he named something small and specific: **stop having to copy shipment IDs and seal IDs out of emails and into INTTRA by hand.**

Tidelane is a much larger answer than the question he asked. It is a good application, and it is not the thing he requested.

So the working order is now:

1. **Deckhand first.** Deliver the thing he actually asked for, in week one. See `docs/deckhand-brief.md`.
2. **Tidelane handover second.** Narrowed, honest, and finished by 3 October.
3. **Track B (Tidelane as a product Yigal sells) is not discussed during the working sessions.** It is a dinner conversation on 4 October, after he has the tool he asked for.

If a session is drifting toward making Tidelane bigger, that is the failure mode. Say so.

## State of the world, stated honestly

Tidelane is a complete, working application and it is currently a **demo**, not Yigal's operational system.

| Area | Reality |
|---|---|
| Data | Seeded and generated. 18 organizations, 7 users, 42 shipments. None of Yigal's real shipments are in it. |
| Accounts | Seven demo accounts sharing the password `tidelane-demo`, listed on `/guide`, which is readable before login. The three internal ones now carry Yigal's real addresses (`yigal.tzfira@`, `effi.mor@`, `ben.mor@galco-intl.com`); the four partner ones are still `*.demo`. Real address, shared demo password: the security items below still apply, unchanged. |
| QuickBooks | **Real.** OAuth 2.0, live invoice pull, invoices matched to shipments by `TL-2026-####` booking ref. The only connector that can go live. |
| CBP ACE | Mock only. The live payload mapper throws "not implemented" on purpose. |
| E2open INTTRA | Mock only, same reason. Real API access requires a vendor agreement, not code. |
| Hosting | Runs on Effi's Cloudflare account under his subdomain. Must transfer to Yigal if this becomes operational. |
| Backups | None. There is no database export routine. |

Never write code or documentation implying the mock connectors are live, or that seeded data is real.

## Domain model

The worker imports `src/types.ts` and `src/data/constants.ts` directly, so client and server share one model. Do not fork it.

- **Organization** — `internal` | `shipper` | `forwarder` | `consignee` | `carrier`. Determines visibility.
- **User** — belongs to one organization, holds one role: `admin` | `ops` | `viewer`.
- **Shipment** — central record. Booking reference format `TL-2026-####`.
- **Container** — attached to a shipment, volume in TEU.
- **Milestone** — a dated event on the shipment timeline.
- **Document** — attached to a shipment, approvable by ops/admin.
- **Party** — links a shipment to an organization playing a role on it.
- **Comment** — thread on a shipment.
- **Invoice** — pulled from QuickBooks, linked to a shipment, state (`open`/`overdue`/`paid`/`void`) derived at read time.
- **Lane** — origin/destination pair, used in analytics and INTTRA schedule lookup.

Access control is two-axis and enforced in the API, never only in the UI: internal users see everything, partner users see only shipments where their org is a party.

**Note a gap:** seal numbers are central to Yigal's actual daily pain and are not obviously first-class in this model. Confirm where a seal number lives before building anything that reads or writes one.

Other known-weak spots, unresolved: whether a shipment can carry containers for more than one consignee; what happens when a booking is rolled to a later vessel; whether a document belongs to a shipment or a container; whether an invoice can cover more than one shipment.

## Hard rules

1. **Never edit an applied migration file.** Add a new one.
2. **Run `npm run db:migrate:remote` manually BEFORE pushing a commit that adds a migration.** CI does not run migrations. Push first and saving QuickBooks settings and pulling invoices will error, and the Invoices page will show an empty ledger.
3. **`CREDENTIALS_KEY` is load-bearing.** Rotating it makes every stored integration credential unreadable and silently degrades providers to mock (UI shows *Stored, unreadable*). Never regenerate it casually.
4. `worker/integrations/registry.ts` is the only code that consumes secret values and decides live vs mock. `worker/integrations/secrets.ts` is the only code that encrypts and decrypts. Keep it that way.
5. A live adapter is never constructed without complete credentials.
6. Valid providers are enforced in `worker/integrations/provider.ts`, not by a database CHECK constraint.
7. `run_worker_first` keeps `/api` out of the SPA fallback. Do not remove it.
8. The seed is byte-stable (seeded PRNG, fixed date anchor, email-derived salts). Regenerating it requires wiping and recreating the database.
9. Secrets never appear in API responses. `GET /api/integrations` returns presence, source (`db`/`env`) and the last four characters only. Preserve this.
10. **Never store or transmit Yigal's INTTRA, ACE or Login.gov portal credentials.** Deckhand works inside a session a human already opened, or not at all. See the brief.

## Local development

```bash
npm install
npm run db:migrate:local     # create + seed local D1 in .wrangler/state
npm run dev:worker           # wrangler dev → http://localhost:8787 (API + built SPA)
npm run dev                  # optional Vite HMR on :5173, proxies /api → :8787
npm run build                # type-checks app + worker + scripts, then bundles
npm run db:reset:local       # wipe and re-seed local
```

Tests: `npm run db:reset:local` then `npm run test:e2e` (Playwright). Covers auth, viewer read-only gating, partner org scoping including direct-URL denial, settings persistence, integrations admin with no secret leakage, the QuickBooks connect flow up to Intuit's door, a mock invoice pull, and booking/comment/approval persistence across reload. Keep it green.

## The Los Angeles visit, 23 September to 5 October 2026

Seven three-hour sessions, 07:00 to 10:00, 24 to 30 September, at Yigal's apartment. Two reserve sessions 2 and 3 October. Effi flies home 5 October.

| # | Date | Purpose |
|---|---|---|
| 1 | Thu 24 Sep | Shadow. Watch Yigal do the manual copying for real. **Count it and time it.** How many bookings a day, how many minutes each. That number decides how far Deckhand goes. Nothing on screen. |
| 2 | Fri 25 Sep | Deckhand v0 in his hands, same morning. Extraction only, no browser. He uses it that afternoon on real emails. |
| 3 | Sat 26 Sep | Harden v0 against the ugly emails in his actual inbox. Decide from the session 1 numbers whether v1 is justified. |
| 4 | Sun 27 Sep | Tidelane reality check: the model against his real records, and exception mining. Every "usually, except when". |
| 5 | Mon 28 Sep | Real data in. Five to ten of his live shipments with real parties, real organizations, real roles. |
| 6 | Tue 29 Sep | QuickBooks live against his real company. Pull, reconcile against a real shipment. |
| 7 | Wed 30 Sep | Handover. He runs Deckhand alone, and books a real shipment and approves a real document alone. |
| R1 | Fri 2 Oct | Reserve: Deckhand v1 if session 3 justified it, plus the security items below. |
| R2 | Sat 3 Oct | Reserve: runbook, ownership transfer, close-out. |

### Definition of done — Deckhand

- [ ] Yigal uses it unassisted on a real inbound email and pastes the result into INTTRA
- [ ] It handles the three most common email formats in his actual inbox
- [ ] Time per booking measured before and after, and written down
- [ ] He knows what to do when it gets something wrong

### Definition of done — Tidelane

- [ ] Yigal's admin account has a password only he knows; the four partner `.demo` accounts no longer exist in his environment
- [ ] At least five of his real shipments in the database with his real parties
- [ ] QuickBooks connected live; one invoice pull reconciles against a real shipment
- [ ] He completes one real booking and one document approval unassisted
- [ ] Written exception register: every case where his work does not fit the model, marked handled / out of scope / open
- [ ] One-page runbook: adding a user, recovering a failed deploy, the migration-before-push rule, and the `CREDENTIALS_KEY` warning

### Security items that must close before any real shipment data is loaded

- [ ] Remove the shared demo password from all seven accounts, and delete the four partner `.demo` accounts
- [ ] Empty or close `/guide`, which currently lists demo accounts pre-login
- [ ] `CREDENTIALS_KEY` generated properly, stored off Effi's laptop, known to a second person
- [ ] Transfer the Cloudflare account, worker, D1 database and Intuit developer app to Yigal
- [ ] Build a database export routine; there is no backup today
- [x] Disable Cloudflare preview URLs (`preview_urls: false` in `wrangler.jsonc`), so a branch build no longer publishes a second public address onto the production database
- [ ] Move off the `workers.dev` subdomain to a domain Yigal owns

## Explicitly out of scope

Add to the parking list, do not build, unless Effi says otherwise in the session:

- Live CBP ACE and E2open INTTRA API integration. Both stay in Mock. Real access is a vendor contract.
- Rebranding or visual redesign.
- Migrating Yigal's full shipment history. Load a working sample, not an archive.
- Rolling logins out to Yigal's customers, carriers or forwarders.
- Deckhand v2 (autonomous inbox intake) during the visit. v0 and possibly v1 only.
- Any new feature request raised mid-visit.
