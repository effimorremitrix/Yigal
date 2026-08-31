-- Tidelane schema
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('internal','shipper','forwarder','consignee','carrier'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin','ops','viewer')),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  password_hash TEXT NOT NULL, -- pbkdf2$<iterations>$<salt_b64>$<hash_b64>
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, -- sha256(token) hex; raw token lives only in the cookie
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  date_format TEXT NOT NULL DEFAULT 'dd MMM yyyy',
  landing_page TEXT NOT NULL DEFAULT '/',
  notify_delays INTEGER NOT NULL DEFAULT 1,
  notify_docs INTEGER NOT NULL DEFAULT 1,
  notify_weekly_digest INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL UNIQUE,
  origin_code TEXT NOT NULL,
  destination_code TEXT NOT NULL,
  via_code TEXT,
  lane_id TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  carrier_scac TEXT NOT NULL,
  vessel_name TEXT NOT NULL,
  vessel_imo TEXT NOT NULL,
  vessel_voyage TEXT NOT NULL,
  status TEXT NOT NULL,
  etd TEXT NOT NULL,
  eta TEXT NOT NULL,
  atd TEXT,
  incoterm TEXT NOT NULL,
  commodity TEXT NOT NULL,
  co2_tons REAL NOT NULL,
  freight_cost_usd INTEGER NOT NULL,
  on_time INTEGER NOT NULL,
  progress REAL NOT NULL,
  delay_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE containers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  number TEXT NOT NULL,
  type TEXT NOT NULL,
  seal_number TEXT NOT NULL,
  weight_kg INTEGER NOT NULL,
  status TEXT NOT NULL,
  dd_risk_usd INTEGER NOT NULL
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  location TEXT NOT NULL,
  planned TEXT NOT NULL,
  actual TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed','current','pending'))
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','pending_approval','approved')),
  uploaded_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE shipment_parties (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  org_id INTEGER REFERENCES organizations(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  contact TEXT NOT NULL
);

CREATE INDEX idx_parties_org ON shipment_parties(org_id, shipment_id);
CREATE INDEX idx_parties_shipment ON shipment_parties(shipment_id);
CREATE INDEX idx_containers_shipment ON containers(shipment_id);
CREATE INDEX idx_milestones_shipment ON milestones(shipment_id);
CREATE INDEX idx_documents_shipment ON documents(shipment_id);
CREATE INDEX idx_comments_shipment ON comments(shipment_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
