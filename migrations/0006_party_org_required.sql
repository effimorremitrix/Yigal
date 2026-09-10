-- Make the party -> organization link a database invariant.
--
-- shipment_parties.org_id was nullable, and worker/shipments.ts resolved it by an exact
-- match on organizations.name, storing NULL on a miss. Because partner visibility is scoped
-- by org_id (scopeClause in worker/shipments.ts), a single mistyped party name produced a
-- shipment permanently invisible to the partner it belonged to, with no error anywhere.
-- The worker now refuses to write an unmatched party; this makes the database enforce it too,
-- so the invariant survives any future caller.
--
-- SQLite cannot add NOT NULL to an existing column, so the table is recreated. No BEGIN/COMMIT
-- (D1 applies the file atomically) and no foreign-key pragma is needed: nothing references
-- shipment_parties, it only references shipments(id) and organizations(id), and the copied
-- values stay valid.
--
-- IMPORTANT: if any row still has org_id IS NULL this file fails, atomically, and nothing
-- changes. That is deliberate — those rows are the bug, and silently dropping or guessing at
-- them would hide it. Audit and repair first:
--     npm run db:audit:parties            (local)
--     npm run db:audit:parties:remote     (deployed)
-- then set each row's org_id to the correct organizations.id before re-running the migration.
--
-- shipments.booking_ref already carries NOT NULL UNIQUE from 0001_schema.sql, so no constraint
-- is added for it here; the race on generating that reference is fixed in the worker instead.

ALTER TABLE shipment_parties RENAME TO shipment_parties_old;
CREATE TABLE shipment_parties (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  contact TEXT NOT NULL
);
INSERT INTO shipment_parties (id, shipment_id, org_id, name, role, contact)
SELECT id, shipment_id, org_id, name, role, contact FROM shipment_parties_old;
DROP TABLE shipment_parties_old;

-- Recreated with the table, since dropping the old one drops its indexes.
CREATE INDEX idx_parties_org ON shipment_parties(org_id, shipment_id);
CREATE INDEX idx_parties_shipment ON shipment_parties(shipment_id);
