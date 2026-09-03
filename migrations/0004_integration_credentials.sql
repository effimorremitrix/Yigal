-- Vendor credentials become runtime-editable by an admin (Settings > Integrations) instead of
-- deploy-time only. Values are stored encrypted (AES-GCM); the master key lives in the
-- CREDENTIALS_KEY worker secret and never in the database.
ALTER TABLE integration_settings ADD COLUMN base_url TEXT; -- NULL = fall back to the *_BASE_URL var

CREATE TABLE integration_credentials (
  provider   TEXT NOT NULL CHECK (provider IN ('ace','inttra')),
  name       TEXT NOT NULL,     -- ACE_API_KEY, INTTRA_CLIENT_ID, INTTRA_API_KEY
  ciphertext TEXT NOT NULL,     -- v1$<iv b64>$<ciphertext b64>
  hint       TEXT NOT NULL,     -- last 4 characters, so the UI can tell two keys apart
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, name)
);
