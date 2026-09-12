-- Business model, and the numbers Yigal actually earns on.
--
-- Yigal is a trader paid a retained commission. There is ONE price: the all-in deal value X,
-- covering goods, freight, insurance and duty. The importer is invoiced X. The producer
-- receives X minus the commission. Yigal keeps the commission. The fee comes out of the
-- producer's side rather than being added on top of the buyer's, which is why the importer has
-- no price incentive to go direct.
--
-- Only the deal value and the rate are stored. The commission and the producer payable are
-- derived at read time in worker/business.ts, the same convention invoices already use for
-- their status, so a changed rate re-derives the pair and the two can never disagree.
--
-- business_profile also selects which business model the whole application presents. It is one
-- row, not a per-user preference, for a reason that is about access control rather than tidiness:
-- 'operator' turns counterparty isolation OFF, so a per-user setting would let a partner user
-- switch off the rule that hides their counterparties from them. Only an internal admin may
-- write it, and the worker reads it server-side on every request.

CREATE TABLE business_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- single row; the CHECK is the constraint that keeps it single
  model TEXT NOT NULL CHECK (model IN ('trader','operator')),
  commission_rate_pct REAL NOT NULL CHECK (commission_rate_pct >= 0 AND commission_rate_pct <= 100),
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT INTO business_profile (id, model, commission_rate_pct, updated_at)
VALUES (1, 'trader', 2.0, '2026-09-12T00:00:00.000Z');

-- Nullable on purpose: a shipment booked before this migration, or booked in operator mode, has
-- no deal value, and a missing value must read as missing rather than as zero. INTEGER matches
-- freight_cost_usd; whole dollars throughout.
ALTER TABLE shipments ADD COLUMN deal_value_usd INTEGER;
-- NULL means "use the house rate from business_profile". A number here overrides it for this
-- shipment only, which is the exception Yigal will certainly have.
ALTER TABLE shipments ADD COLUMN commission_rate_pct REAL;

-- Backfill for the 42 seeded shipments so the demo shows numbers instead of blanks.
--
-- THESE VALUES ARE SYNTHETIC. They are not Yigal's prices, nor anyone's; the whole seed is
-- generated. They are computed from values already in each row so the result is deterministic
-- and identical on every database, which is what lets this run as a new migration instead of
-- regenerating the byte-stable seed in 0002 (and wiping the database to do it).
--
-- Freight is roughly 8 percent of a landed value, so freight x 12 puts the deal value in a
-- believable place; the booking-reference term spreads the rest so every shipment does not carry
-- the same round multiple. No random(): it would differ per database and break that guarantee.
UPDATE shipments
SET deal_value_usd = freight_cost_usd * 12 + (CAST(substr(booking_ref, 9) AS INTEGER) % 9) * 2500
WHERE deal_value_usd IS NULL;
