# INTTRA (e2open) module scope

Working document for the pricing conversation with e2open. It answers one question: **which INTTRA
modules does Tidelane actually need on the API key**, and it answers it from the connector code
rather than from a wishlist.

INTTRA is not sold as a single key. It is licensed per module, usually per environment (UAT plus
production) and per transaction volume, so the quote we receive is a direct function of the list we
send. An over-broad list buys adapters we have not written.

## Summary: what to ask them to price

| Tier | Module | Decision |
|---|---|---|
| 1 | Ocean Schedules | Buy now |
| 1 | Track & Trace (container visibility) | Buy now |
| 2 | eBooking | Firm price, phase 2 |
| 3 | Shipping Instructions, eVGM, draft B/L | Indicative price only |
| - | Customs filing, freight invoicing, rate management | Not requested |

Do not let Shipping Instructions be bundled into the must-have tier. We have no code that can send
one, and no document exchange model to receive one back.

## Evidence from the codebase

| App capability | Where it lives | INTTRA module | Verdict |
|---|---|---|---|
| Booking wizard step 3, sailing options | `InttraAdapter.searchSchedules` (`worker/integrations/inttra/client.ts`), route in `worker/index.ts`, handler `searchSchedules` in `worker/integrations/api.ts`, consumed by `src/pages/BookingPage.tsx` | Ocean Schedules | Must have. The only INTTRA path routed end to end today; without it the app falls back to a generator. |
| Milestone timeline, Track & Trace map, dashboard exceptions, on-time KPIs | `InttraAdapter.getTrackingEvents` (`client.ts`), mock at `inttra/mock.ts`, rendered by `src/components/shipments/MilestoneTimeline.tsx` and `src/components/map/WorldMap.tsx` | Track & Trace | Must have. Defined and mocked, not yet routed; the biggest single gap between demo and product. |
| New Booking submitting to the carrier | `InttraAdapter.submitBooking` (`client.ts`), `BookingRequest` (`worker/integrations/provider.ts`) | eBooking | Phase 2. A booking writes only to D1 today; `provider.ts` already flags that a real vendor write needs idempotency and retry design first. |
| Documents tab: SI, BL, VGM | `DocType` (`src/types.ts`), `src/pages/DocumentsPage.tsx` | Shipping Instructions, eVGM, draft B/L | Indicative only. Seeded rows today, no vendor exchange, no adapter method. |
| Invoices and receivables | QuickBooks connector | none | Out of scope for INTTRA. |
| US customs filing status | ACE connector (`worker/integrations/ace/`) | none | Out of scope for INTTRA. |

## What to ask e2open

1. **Module pricing, tiered as above**, priced per module rather than as a bundle.
2. **Push versus polling for tracking.** Do they offer webhooks or event push, or is Track & Trace
   poll only? Polling pricing is materially worse for us and changes the volume answer.
3. **Environments.** UAT/sandbox plus production, keyed separately, sandbox from day one. Switching
   costs us nothing: the connector has a per-provider base URL override (`INTTRA_BASE_URL`).
4. **Auth and credential set.** Confirm OAuth 2.0 client-credentials and exactly which values they
   issue (client id, client secret, subscription key?). Our client assumes client id plus client
   secret against a token endpoint; a third value is a one-line change to `SECRET_NAMES`.
5. **Event vocabulary coverage.** Confirm they can supply our eight milestone codes:
   `booking_confirmed`, `container_gate_in`, `loaded_on_vessel`, `vessel_departed`, `transshipment`,
   `vessel_arrived`, `gate_out`, `delivered`. Confirming this before signing avoids a mapping
   surprise afterwards.
6. **Carrier coverage per module** across our nine trade lanes (`LANES` in `src/data/constants.ts`).
   INTTRA coverage varies by carrier and by module.
7. **Rate limits and SLA** per module, and what happens on breach.

**Open input, needed from us before they can quote:** expected production volume. Specifically
shipments per month, peak schedule searches per day, and containers tracked concurrently. Schedules
are searched interactively on every booking wizard step-3 render, so the search figure is not the
same as the shipment figure.

## Code plan for when the key arrives

Ordered so each step ships on its own. Nothing here starts before the vendor spec is in hand; the
current placeholders in `client.ts` are deliberate, and every live mapper throws an explicit
"not implemented" error so a premature switch to Live fails loudly instead of silently.

### Step 1: credentials shape

`SECRET_NAMES.inttra` in `worker/integrations/config.ts` is the single source of truth for the fields
the admin UI renders, so adding a credential is a one-line change with no migration
(`migrations/0004` constrains the provider column, not the secret name; the name list in its comment
is stale documentation only). Rename `INTTRA_API_KEY` to `INTTRA_CLIENT_SECRET` if that is what they
issue, and update `.dev.vars.example`, `README.md` and `worker/env.ts` in the same change.

### Step 2: Schedules live (tier 1)

In `worker/integrations/inttra/client.ts`, replace `SCHEDULES_PATH` and `mapSchedules` with the
vendor spec, keeping the throw as the fallback for unrecognised payloads. Fix `TOKEN_PATH` and
`HEALTH_PATH`; `/ping` is a guess, and if they expose no health endpoint, make `healthCheck` a token
fetch instead. Everything downstream already works: the route, the handler, `ScheduleResult.source`
and the mock/live switch in `registry.ts` need no change.

### Step 3: Track & Trace live (tier 1)

The adapter method exists, the route does not. Add:

- A `getTrackingEvents` handler in `worker/integrations/api.ts` next to `searchSchedules`, reusing
  `resolveInttra`, `requireEnabled` and `toHttpError`, and building the `ShipmentLookup` the same way
  the ACE customs handler does.
- Route `GET /api/integrations/inttra/shipments/:id/tracking` in `worker/index.ts`, mirroring the ACE
  customs route including its `requireRole(user, ['admin','ops'])` guard.
- A client fetch in `ShipmentDetailPage`, feeding `MilestoneTimeline` with vendor actuals overlaid on
  planned milestones.
- `mapTrackingEvents` in `client.ts`, mapping vendor event codes onto `MilestoneKey`. Unknown codes
  are dropped with a log; they must never crash the timeline.

### Step 4: eBooking (tier 2, only after design)

Needs a migration to persist the vendor booking number and acknowledgement status on the shipment, an
idempotency key derived from `bookingRef`, and a retry and duplicate-submit policy. Then wire
`submitBooking` into the booking creation path and implement `mapBookingAck`. Do not start until
steps 2 and 3 are green in production.

### Not in scope

SI, eVGM and draft B/L need new adapter methods and a document exchange model. Out of this change.

## Verification once wired

1. `npm run build` type-checks app, worker and scripts.
2. `npm run db:reset:local && npm run dev:worker`.
3. Sign in as `effi@tidelane.demo`, Settings, Integrations, INTTRA: save base URL and credentials,
   switch to Live, press Test connection. Expect `OK · live` with a latency figure, and a clear auth
   error rather than a 500 on a bad key.
4. Booking wizard step 3: sailings load and `ScheduleResult.source` reads `live`.
5. Shipment detail: the milestone timeline shows vendor actuals, and a shipment with no vendor events
   still renders its planned milestones.
6. Kill switch: disable INTTRA in Settings; both endpoints return 503 and the UI degrades cleanly.
7. `npm run test:e2e`. The existing INTTRA specs run against the mock and must stay green; the
   deterministic-schedules assertion is the regression guard that live wiring did not change mock
   behaviour.
