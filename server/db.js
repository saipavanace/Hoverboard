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

/** Lightweight migrations for existing SQLite files */
(() => {
  const addCol = (table, name, defSql) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${defSql}`);
  };
  addCol('drs', 'category', 'category TEXT');
  addCol('drs', 'labels', 'labels TEXT');
  addCol('drs', 'status', `status TEXT DEFAULT 'open'`);
  addCol('drs', 'priority', 'priority TEXT');
  addCol('drs', 'description', 'description TEXT');
  addCol('drs', 'comments', 'comments TEXT');
  addCol('drs', 'spec_reference', 'spec_reference TEXT');
  addCol('vrs', 'category', 'category TEXT');
  addCol('vrs', 'labels', 'labels TEXT');
  addCol('specs', 'folder_path', 'folder_path TEXT');
  addCol('specs', 'description', 'description TEXT');
  addCol('specs', 'project_id', 'project_id INTEGER');
  addCol('drs', 'artifact_id', 'artifact_id INTEGER');
  addCol('drs', 'project_id', 'project_id INTEGER');
  addCol('vrs', 'artifact_id', 'artifact_id INTEGER');
  addCol('vrs', 'project_id', 'project_id INTEGER');
  addCol('vrs', 'stale', 'stale INTEGER DEFAULT 0');
  addCol('vrs', 'stale_reason', 'stale_reason TEXT');
})();

db.exec(`
CREATE TABLE IF NOT EXISTS coverage_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,          -- 'functional' | 'code'
  value REAL NOT NULL,         -- 0..100
  source TEXT,
  run_id TEXT,
  captured_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vr_coverage (
  vr_id INTEGER PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  last_seen_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (vr_id) REFERENCES vrs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vr_coverage_files (
  vr_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  test_name TEXT,
  PRIMARY KEY (vr_id, file_path),
  FOREIGN KEY (vr_id) REFERENCES vrs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  parent_team_id INTEGER,
  department TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  provider_subject TEXT,
  provider_issuer TEXT,
  password_hash TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  manager_user_id INTEGER,
  team_id INTEGER,
  department TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (manager_user_id) REFERENCES users(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_global_roles (
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_project_roles (
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  artifact_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT,
  status TEXT,
  asil_level TEXT,
  current_version_id INTEGER,
  legacy_table TEXT,
  legacy_row_id INTEGER,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE (project_id, artifact_type, external_id)
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE (artifact_id, version_number)
);

CREATE TABLE IF NOT EXISTS artifact_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_artifact_id INTEGER NOT NULL,
  target_artifact_id INTEGER NOT NULL,
  link_type TEXT NOT NULL,
  link_status TEXT NOT NULL DEFAULT 'valid',
  suspect_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (target_artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (file_hash, storage_path)
);

CREATE TABLE IF NOT EXISTS artifact_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL,
  parent_comment_id INTEGER,
  body TEXT NOT NULL,
  author_user_id INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT,
  resolved_by_user_id INTEGER,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES artifact_comments(id),
  FOREIGN KEY (author_user_id) REFERENCES users(id),
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS artifact_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artifact_id INTEGER NOT NULL,
  artifact_version_id INTEGER NOT NULL,
  approved_by_user_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_version_id) REFERENCES artifact_versions(id),
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS signoff_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  artifact_type TEXT,
  asil_level TEXT,
  required_project_role TEXT,
  independence_level INTEGER NOT NULL DEFAULT 0,
  allow_author_approval INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS baseline_items (
  baseline_id INTEGER NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_version_id INTEGER NOT NULL,
  PRIMARY KEY (baseline_id, artifact_id),
  FOREIGN KEY (baseline_id) REFERENCES baselines(id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id),
  FOREIGN KEY (artifact_version_id) REFERENCES artifact_versions(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT DEFAULT (datetime('now')),
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail_json TEXT,
  ip_address TEXT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  nonce TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS user_synced_groups (
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  group_name TEXT NOT NULL,
  synced_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider, group_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

(() => {
  const addCol = (table, name, defSql) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${defSql}`);
  };
  addCol('users', 'job_title', 'job_title TEXT');
})();

/** evidence_files columns (table created above) */
(() => {
  const addCol = (table, name, defSql) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${defSql}`);
  };
  addCol('evidence_files', 'project_id', 'project_id INTEGER');
  addCol('evidence_files', 'file_name', 'file_name TEXT');
  addCol('evidence_files', 'artifact_id', 'artifact_id INTEGER');
  addCol('evidence_files', 'artifact_version_id', 'artifact_version_id INTEGER');
  addCol('evidence_files', 'uploaded_by_user_id', 'uploaded_by_user_id INTEGER');
})();

/** projects metadata */
(() => {
  const addCol = (table, name, defSql) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${defSql}`);
  };
  addCol('projects', 'description', 'description TEXT');
  addCol('projects', 'status', `status TEXT DEFAULT 'active'`);
})();

/** Default project + backfill (after graph/auth tables exist) */
(() => {
  let def = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  if (!def) {
    db.prepare(`INSERT INTO projects (slug, name) VALUES ('default', 'Default project')`).run();
    def = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  }
  const pid = def.id;
  db.prepare(`UPDATE specs SET project_id = ? WHERE project_id IS NULL`).run(pid);
})();

/** Internal actor for audit rows when auth is disabled */
(() => {
  const row = db.prepare(`SELECT id FROM users WHERE email = 'system@hoverboard.internal'`).get();
  if (!row) {
    db.prepare(
      `INSERT INTO users (email, display_name, enabled) VALUES ('system@hoverboard.internal', 'System', 1)`
    ).run();
  }
})();

export function nextPublicId(prefix, counterKey) {
  const run = db.transaction(() => {
    db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run(counterKey);
    return db.prepare('SELECT value FROM counters WHERE key = ?').get(counterKey);
  });
  const row = run();
  const n = String(row.value).padStart(5, '0');
  return `${prefix}-${n}`;
}
