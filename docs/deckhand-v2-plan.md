# Deckhand: mailbox → booking draft → INTTRA (mock-grade)

## Context

Effi asked whether the platform has a tool called **Deckhand** that connects to email, identifies the supplier, and copies the details into INTTRA. **It does not exist** — zero matches for "deckhand" in the working tree, in git history on all refs, and in every filename ever committed. Nor does anything it would need:

- **No mail capability at all.** No IMAP/SMTP/Gmail/Graph, no `email` binding, no attachment handling, no `nodemailer`/`mime`. The word "email" appears only as the user login field and one dead "Email notifications" preference toggle.
- **No supplier identity.** `organizations` (migrations/0001_schema.sql:2-6) carries only `id`, `name UNIQUE`, `type`. No email domain, no SCAC, no external id. `shipment_parties.org_id` is resolved by exact name string match (worker/shipments.ts:244-245) and silently stores NULL on a miss — which makes the shipment permanently invisible to that partner under `scopeClause` (worker/shipments.ts:32-35).
- **No INTTRA write path.** `submitBooking` is declared (worker/integrations/provider.ts:49-55) and mocked, but deliberately unrouted; the comment at provider.ts:53 says vendor writes need idempotency and retry design first. All three live mappers throw `IntegrationError('inttra','unmapped')` by design until e2open specs land.
- **No background execution.** `wrangler.jsonc` declares only `assets` + one D1 binding. `worker/index.ts:113-130` exports only `fetch`, and does not accept `ctx`, so even `waitUntil` is impossible as written.

The only INTTRA automation today is `GET /api/integrations/inttra/schedules` filling step 3 of the booking wizard; in mock mode it calls the SPA's own deterministic generator.

**Goal:** build Deckhand as a demo-grade fourth connector — a mock mailbox, confidence-scored sender identification, deterministic field extraction, and a human review queue that drives the *existing* booking endpoint. No real mail connection, no LLM, everything deterministic and demoable, following the mock/live pattern the other three connectors already use.

## Approach

Deckhand becomes a fourth provider in the existing registry, so it inherits the enable/disable toggle, mock/live switch, credential storage and connection test for free.

### 1. Connector skeleton

Follow the QuickBooks precedent exactly:

- `worker/integrations/provider.ts` — add `'deckhand'` to `PROVIDERS` and `PROVIDER_LABEL`, plus a `DeckhandAdapter` interface: `listMessages(query): Promise<InboundMessage[]>` and `healthCheck()`.
- `worker/integrations/config.ts` — add `deckhand` to `SECRET_NAMES` and `BASE_URL_VAR`.
- `worker/integrations/registry.ts` — `resolveDeckhand()` + a `resolve()` case, keeping the invariant that a live adapter is never built without complete credentials.
- `worker/integrations/deckhand/mock.ts` — a fixed corpus of ~8 realistic booking-request emails, seeded with `mulberry32`/`seedOf` from `src/data/random.ts` the way `inttra/mock.ts` does, so output is byte-stable across runs.
- `worker/integrations/deckhand/client.ts` — live adapter whose mapper throws `unmapped`, matching how `inttra/client.ts:74-82` stands in for a spec that does not exist yet.
- `src/components/settings/IntegrationsTab.tsx` — one `DESCRIPTIONS` entry; the card itself renders generically.
- `worker/env.ts`, `.dev.vars.example`, `wrangler.jsonc` vars — `DECKHAND_BASE_URL` and its secret names.

### 2. Schema — migration `0006_deckhand.sql` (next free number; never edit an applied migration)

- `ALTER TABLE organizations ADD COLUMN email_domain TEXT` — the minimal change that makes sender→org possible. Backfill it from the users already seeded against each org rather than hardcoding, so no seed regeneration is needed:
  `UPDATE organizations SET email_domain = (SELECT lower(substr(u.email, instr(u.email,'@')+1)) FROM users u WHERE u.org_id = organizations.id LIMIT 1)`.
  The seeded demo users already use org-specific domains (`@atlaspolymers.demo`, `@globalfreight.demo`, …), so this lights up immediately.
- `inbound_messages` — the ingested mail: `id`, `provider`, `external_id`, `from_address`, `from_name`, `subject`, `body_text`, `received_at`, `source CHECK IN ('mock','live')`, `synced_at`, `UNIQUE (provider, external_id)` so every pull upserts. Mirrors the `invoices` table from `0005`.
- `booking_drafts` — the extraction and its review state: `id`, `message_id` FK, `org_id` nullable FK, `match_confidence REAL`, `match_reason`, the booking fields (`origin_code`, `destination_code`, `incoterm`, `commodity`, `weight_kg`, `containers` JSON), `field_confidence` JSON, `status CHECK IN ('needs_review','approved','rejected','booked')`, `shipment_id` nullable FK `ON DELETE SET NULL`, `reviewed_by` FK users, `reviewed_at`, `created_at`.
- `INSERT OR IGNORE INTO integration_settings (provider, enabled, mode, updated_at) VALUES ('deckhand', 1, 'mock', …)`.

Two tables rather than one because a message that turns out not to be a booking request still needs to exist and be dismissible.

### 3. Sender identification (`worker/deckhand/match.ts`)

Confidence-scored, best match wins, never silently guesses:

| Signal | Confidence |
|---|---|
| `from_address` domain equals `organizations.email_domain` | 0.95 |
| That domain appeared on a party of a prior shipment | 0.7 |
| Company name in the signature matches `organizations.name` | 0.5 |
| No signal | 0.0 → `org_id` stays NULL, draft flagged `unknown sender` |

Anything below a threshold reaches the reviewer with the org field empty and required. **A draft never creates a shipment with a NULL party org** — that is exactly the bug that would make a shipment invisible to the partner forever.

### 4. Extraction (`worker/deckhand/extract.ts`)

Deterministic parsing, **no LLM**: port names and UN/LOCODEs matched against the existing `PORTS` map in `src/data/constants.ts`, container types against `ContainerType`, incoterms against the `Incoterm` union, plus dated/quantity regexes. Each field is returned with a confidence so the review UI can highlight what it guessed. This matches the repo's mock philosophy — every other mock is seeded and byte-stable — and keeps the e2e suite meaningful. Live mode is where an LLM would slot in behind the same interface; that is out of scope here and called out as such.

### 5. API surface (`worker/deckhand/api.ts`, routed in `worker/index.ts`)

All gated with `requireInternal` (worker/auth.ts:115-119), the same gate Invoices uses — inbound customer mail is not partner-visible:

- `POST /api/integrations/deckhand/mail/sync` — pull messages, upsert, run match + extract, create `needs_review` drafts. Request-scoped and manual, like the QuickBooks invoice sync; records `last_sync_*` via the existing `saveSync`.
- `GET /api/deckhand/drafts` — list with their messages.
- `PATCH /api/deckhand/drafts/:id` — reviewer corrections (fields, org).
- `POST /api/deckhand/drafts/:id/approve` — body carries the chosen sailing; the handler calls the **existing** `createShipment` (worker/shipments.ts:198) rather than a second write path, then stamps the draft `booked` + `shipment_id`.
- `POST /api/deckhand/drafts/:id/reject`.

### 6. Review UI (`src/pages/DeckhandPage.tsx`)

New route in `src/main.tsx` and a sidebar item in `src/components/layout/Sidebar.tsx` using the existing `internalWrite: true` flag that Invoices already uses (Sidebar.tsx:23). Split view: original email on one side, the parsed draft as an editable form on the other, low-confidence fields visibly flagged, sailing picker reusing `GET /api/integrations/inttra/schedules`, then **Create booking**. Reuses `Card`/`CardHeader`, `StatusBadge`, `inputs.tsx`.

### 7. INTTRA submission — last, separate increment

Route `submitBooking` as `POST /api/integrations/inttra/shipments/:id/booking`, take an idempotency key from `bookingRef`, store the returned `carrierBookingNumber` on the shipment. In mock this closes the loop end to end; in live it returns 502 `unmapped` until e2open specs exist, which is the honest current state.

## Increments (each independently mergeable and demoable)

1. Connector skeleton + mock mailbox + sync endpoint + read-only draft list. *Demo: press Sync, see 8 parsed requests.*
2. `email_domain` + matching + confidence chips + reviewer override.
3. Approve → creates a real shipment through the existing endpoint; draft links to it.
4. Route `submitBooking`, stamp the carrier booking number.

## Risks to flag to a reviewer

- **`bookingRef` generation is already racy.** `createShipment` does `SELECT MAX(...)` then inserts outside the batch's transaction (worker/shipments.ts:208-213). Deckhand approving several drafts in quick succession makes that collision far more likely than the wizard ever did. Increment 3 should not land without addressing it.
- **`createShipment` validates almost nothing.** `incoterm`, `commodity`, `weightKg` and the whole `schedule` object are written verbatim. Machine-extracted values raise the stakes; the approve handler must validate before calling it.
- **NULL `org_id` is a silent data trap**, per §3.
- **`created_by` will be the approving user, not the sender.** Acceptable, worth being explicit about in the UI.
- Attachments (the real-world case — a PDF booking form) cannot be stored: no R2, no blob column. Text-body only, stated up front.

## Verification

- `npm run build` (type-checks app + worker + scripts).
- `npm run db:reset:local && npm run dev:worker`, log in as `effi@tidelane.demo` / `tidelane-demo`, open the Deckhand page, press Sync, confirm 8 drafts with sender matches; approve one and confirm a `TL-2026-####` shipment appears in Shipments with the right shipper party.
- Confirm a partner login (`dana@atlaspolymers.demo`) gets 403 on `/api/deckhand/drafts` and no sidebar item.
- New e2e cases in `e2e/app.spec.ts` following the existing integration tests: mock sync is deterministic (same 8 external ids twice, no duplicate rows), an unknown sender blocks approval until an org is chosen, approval persists a shipment across reload, and a partner org is denied. Run `npm run db:reset:local` first — `workers: 1`, shared D1.
