-- QuickBooks Online joins the connectors, and pulled invoices get a table of their own.
-- SQLite cannot drop a CHECK constraint, so both integration tables are recreated without the
-- provider list: worker/integrations/provider.ts (isProvider) is the single source of truth now.
-- No BEGIN/COMMIT (D1 applies the file atomically) and no foreign-key pragma is needed: nothing
-- references these two tables, they only reference users(id), and the copied values stay valid.

ALTER TABLE integration_settings RENAME TO integration_settings_old;
CREATE TABLE integration_settings (
  provider TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'mock' CHECK (mode IN ('mock','live')),
  base_url TEXT,                              -- NULL = fall back to the *_BASE_URL var
  last_check_at TEXT,
  last_check_ok INTEGER,
  last_check_mode TEXT CHECK (last_check_mode IN ('mock','live')),
  last_check_latency_ms INTEGER,
  last_check_message TEXT,
  oauth_state TEXT,                           -- pending OAuth authorize round-trip; single use, expires
  oauth_state_expires_at TEXT,
  last_sync_at TEXT,                          -- last data pull (invoices), independent of the health check
  last_sync_ok INTEGER,
  last_sync_mode TEXT CHECK (last_sync_mode IN ('mock','live')),
  last_sync_count INTEGER,
  last_sync_message TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);
INSERT INTO integration_settings
  (provider, enabled, mode, base_url, last_check_at, last_check_ok, last_check_mode, last_check_latency_ms, last_check_message, updated_by, updated_at)
SELECT provider, enabled, mode, base_url, last_check_at, last_check_ok, last_check_mode, last_check_latency_ms, last_check_message, updated_by, updated_at
FROM integration_settings_old;
DROP TABLE integration_settings_old;

ALTER TABLE integration_credentials RENAME TO integration_credentials_old;
CREATE TABLE integration_credentials (
  provider   TEXT NOT NULL,
  name       TEXT NOT NULL,     -- e.g. ACE_API_KEY, QUICKBOOKS_REFRESH_TOKEN
  ciphertext TEXT NOT NULL,     -- v1$<iv b64>$<ciphertext b64>
  hint       TEXT NOT NULL,     -- last 4 characters, so the UI can tell two keys apart
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, name)
);
INSERT INTO integration_credentials (provider, name, ciphertext, hint, updated_by, updated_at)
SELECT provider, name, ciphertext, hint, updated_by, updated_at FROM integration_credentials_old;
DROP TABLE integration_credentials_old;

INSERT OR IGNORE INTO integration_settings (provider, enabled, mode, updated_at)
  VALUES ('quickbooks', 1, 'mock', '2026-09-06T00:00:00.000Z');

-- Invoices pulled from the accounting connector. One row per vendor invoice; every pull upserts.
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,                  -- vendor id (QBO Invoice.Id)
  doc_number TEXT,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  booking_ref TEXT,                           -- TL-2026-#### found in the vendor memo / mock seed
  shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
  txn_date TEXT NOT NULL,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_amount REAL NOT NULL,
  balance REAL NOT NULL,
  vendor_status TEXT,                         -- QBO EmailStatus, or 'Voided'
  memo TEXT,
  source TEXT NOT NULL CHECK (source IN ('mock','live')),
  vendor_updated_at TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE (provider, external_id)
);
CREATE INDEX idx_invoices_shipment ON invoices(shipment_id);
CREATE INDEX idx_invoices_provider_due ON invoices(provider, due_date);
CREATE INDEX idx_invoices_booking_ref ON invoices(booking_ref);
