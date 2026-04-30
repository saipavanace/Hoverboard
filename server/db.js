import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.HOVERBOARD_DB_PATH || path.join(dataDir, 'hoverboard.sqlite');
export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS specs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  latest_version_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spec_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  storage_path TEXT,
  extracted_text TEXT,
  changelog TEXT,
  uploaded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (spec_id) REFERENCES specs(id),
  UNIQUE (spec_id, version)
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  spec_version_id INTEGER NOT NULL,
  excerpt TEXT NOT NULL,
  anchor_hint TEXT,
  stale INTEGER DEFAULT 0,
  stale_reason TEXT,
  asil TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (spec_version_id) REFERENCES spec_versions(id)
);

CREATE TABLE IF NOT EXISTS vrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  priority TEXT,
  owner TEXT,
  location_scope TEXT,
  verification_method TEXT,
  milestone_gate TEXT,
  evidence_links TEXT,
  last_verified TEXT,
  asil TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vr_dr_links (
  vr_id INTEGER NOT NULL,
  dr_id INTEGER NOT NULL,
  PRIMARY KEY (vr_id, dr_id),
  FOREIGN KEY (vr_id) REFERENCES vrs(id) ON DELETE CASCADE,
  FOREIGN KEY (dr_id) REFERENCES drs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT,
  detail TEXT,
  user_label TEXT DEFAULT 'local',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regression_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  class TEXT,
  state TEXT DEFAULT 'OPEN',
  trend_json TEXT,
  total INTEGER DEFAULT 0,
  hits_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regression_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature_id INTEGER NOT NULL,
  at TEXT DEFAULT (datetime('now')),
  action TEXT,
  reference TEXT,
  state TEXT,
  FOREIGN KEY (signature_id) REFERENCES regression_signatures(id)
);

CREATE TABLE IF NOT EXISTS iso_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vr_id INTEGER,
  dr_id INTEGER,
  artifact_type TEXT,
  reference TEXT,
  status TEXT,
  FOREIGN KEY (vr_id) REFERENCES vrs(id),
  FOREIGN KEY (dr_id) REFERENCES drs(id)
);

INSERT OR IGNORE INTO counters (key, value) VALUES ('dr', 0), ('vr', 0);
`);

export function nextPublicId(prefix, counterKey) {
  const run = db.transaction(() => {
    db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run(counterKey);
    return db.prepare('SELECT value FROM counters WHERE key = ?').get(counterKey);
  });
  const row = run();
  const n = String(row.value).padStart(5, '0');
  return `${prefix}-${n}`;
}
