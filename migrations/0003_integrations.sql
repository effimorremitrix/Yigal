-- Runtime-editable integration toggles plus the last health-check result. Secrets never live here.
CREATE TABLE integration_settings (
  provider TEXT PRIMARY KEY CHECK (provider IN ('ace','inttra')),
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'mock' CHECK (mode IN ('mock','live')),
  last_check_at TEXT,
  last_check_ok INTEGER,
  last_check_mode TEXT CHECK (last_check_mode IN ('mock','live')),
  last_check_latency_ms INTEGER,
  last_check_message TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT INTO integration_settings (provider, enabled, mode, updated_at) VALUES
  ('ace', 1, 'mock', '2026-09-01T00:00:00.000Z'),
  ('inttra', 1, 'mock', '2026-09-01T00:00:00.000Z');
