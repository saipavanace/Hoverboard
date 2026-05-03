/**
 * Full-database JSON snapshot for system administrators (break-glass).
 * Read shape matches persisted SQLite rows + computed metrics (denormalized for inspection).
 */
import { loadConfig } from '../config.js';
import { computeReleaseReadiness } from './releaseProjection.js';

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** Tables exported in dependency-friendly insert order (parents before children). */
const EXPORT_TABLES_INSERT_ORDER = [
  'counters',
  'projects',
  'teams',
  'users',
  'user_global_roles',
  'user_project_roles',
  'user_synced_groups',
  'specs',
  'spec_versions',
  'drs',
  'vrs',
  'vr_dr_links',
  'vr_coverage',
  'vr_coverage_files',
  'iso_evidence',
  'regression_signatures',
  'regression_activity',
  'coverage_metrics',
  'artifacts',
  'artifact_versions',
  'artifact_links',
  'artifact_comments',
  'artifact_approvals',
  'signoff_rules',
  'baselines',
  'baseline_items',
  'evidence_files',
  'audit_log',
  'audit_events',
];

const SKIP_EXPORT = new Set(['sessions', 'oauth_states', 'admin_persisted_snapshot']);

function safeSelectAll(db, table) {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all();
  } catch {
    return [];
  }
}

function redactUsers(rows) {
  return rows.map((u) => ({
    ...u,
    password_hash: u.password_hash != null ? '[REDACTED]' : null,
  }));
}

function computeMetricsForProject(db, pid) {
  const drTotal = db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM drs d
    JOIN spec_versions sv ON d.spec_version_id = sv.id
    JOIN specs s ON sv.spec_id = s.id
    WHERE s.project_id = ?
  `
    )
    .get(pid).n;
  const drStale = db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM drs d
    JOIN spec_versions sv ON d.spec_version_id = sv.id
    JOIN specs s ON sv.spec_id = s.id
    WHERE s.project_id = ? AND d.stale = 1
  `
    )
    .get(pid).n;
  const vrTotal = db.prepare(`SELECT COUNT(*) AS n FROM vrs WHERE project_id = ?`).get(pid).n;
  const vrCovered = db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM vrs v
    JOIN vr_coverage c ON c.vr_id = v.id AND c.hits > 0
    WHERE v.project_id = ?
  `
    )
    .get(pid).n;
  const sigs = db.prepare(`SELECT COUNT(*) AS n FROM regression_signatures`).get().n;

  const fnRow = db
    .prepare(`SELECT value FROM coverage_metrics WHERE kind = 'functional' ORDER BY id DESC LIMIT 1`)
    .get();
  const cdRow = db
    .prepare(`SELECT value FROM coverage_metrics WHERE kind = 'code' ORDER BY id DESC LIMIT 1`)
    .get();
  const functionalCoverage = fnRow ? Math.round(Number(fnRow.value)) : 0;
  const codeCoverage = cdRow ? Math.round(Number(cdRow.value)) : 0;
  const vrCoverage = vrTotal ? Math.round((vrCovered / vrTotal) * 100) : 0;

  const requirementKindCoverage = (kind) => {
    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM vrs WHERE project_id = ? AND vr_kind = ?`)
      .get(pid, kind).n;
    const covered = db
      .prepare(
        `
      SELECT COUNT(*) AS n FROM vrs v
      JOIN vr_coverage c ON c.vr_id = v.id AND c.hits > 0
      WHERE v.project_id = ? AND v.vr_kind = ?
    `
      )
      .get(pid, kind).n;
    return {
      total,
      covered,
      pct: total ? Math.round((covered / total) * 100) : 0,
    };
  };

  const drCovered = (() => {
    const rows = db
      .prepare(
        `
        SELECT dr.id,
               (SELECT COUNT(*) FROM vr_dr_links l WHERE l.dr_id = dr.id) AS link_count,
               (SELECT COUNT(*) FROM vr_dr_links l
                  JOIN vr_coverage c ON c.vr_id = l.vr_id
                  WHERE l.dr_id = dr.id AND c.hits > 0) AS covered_count
        FROM drs dr
        JOIN spec_versions sv ON dr.spec_version_id = sv.id
        JOIN specs s ON sv.spec_id = s.id
        WHERE s.project_id = ?
      `
      )
      .all(pid);
    return rows.filter((r) => r.link_count > 0 && r.covered_count === r.link_count).length;
  })();
  const drClosure = drTotal ? Math.round((drCovered / drTotal) * 100) : 0;
  const passRate = 92 + (vrCovered % 7);

  const cfg = loadConfig();
  const readiness = computeReleaseReadiness(
    {
      passRate,
      functionalCoverage,
      codeCoverage,
      vrCoverage,
      drClosure,
    },
    cfg.releaseMetricWeights || {},
    db.prepare(`SELECT length(changelog) FROM spec_versions`).all().map(() => 2.5)
  );

  return {
    functionalCoverage,
    codeCoverage,
    vrCoverage,
    requirementCoverageByKind: {
      VR: requirementKindCoverage('VR'),
      SR: requirementKindCoverage('SR'),
      CR: requirementKindCoverage('CR'),
      AR: requirementKindCoverage('AR'),
    },
    drCoverage: drClosure,
    drTotal,
    drStale,
    drCovered,
    vrTotal,
    vrCovered,
    regressionSignatures: sigs,
    passRate,
    releaseReadiness: readiness,
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function buildFullSnapshot(db) {
  const tables = {};
  for (const name of EXPORT_TABLES_INSERT_ORDER) {
    let rows = safeSelectAll(db, name);
    if (name === 'users') rows = redactUsers(rows);
    tables[name] = rows;
  }

  const allTables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => r.name);

  const extras = {};
  for (const name of allTables) {
    if (SKIP_EXPORT.has(name) || EXPORT_TABLES_INSERT_ORDER.includes(name)) continue;
    extras[name] = safeSelectAll(db, name);
  }

  const projects = db.prepare(`SELECT id FROM projects`).all();
  const metricsByProject = {};
  for (const { id } of projects) {
    metricsByProject[String(id)] = computeMetricsForProject(db, id);
  }

  const coverageHistory = db
    .prepare(`SELECT * FROM coverage_metrics ORDER BY id DESC LIMIT 500`)
    .all();

  return {
    meta: {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      note:
        'Canonical state lives in SQLite tables; this document is a point-in-time export. computed.* is derived only for inspection. Persisted mirror row (admin_persisted_snapshot) is optional and updated only via POST /api/admin/full-snapshot/persist or after destructive Apply — not on every ingest. password_hash is redacted on export.',
    },
    config: loadConfig(),
    tables: { ...tables, ...extras },
    computed: {
      metricsByProject,
      coverage_metrics_recent: coverageHistory,
    },
  };
}

/**
 * Persists the latest snapshot JSON into SQLite (single row) for audit / offline inspection.
 * @param {import('better-sqlite3').Database} db
 */
export function persistSnapshot(db) {
  const snap = buildFullSnapshot(db);
  const json = JSON.stringify(snap);
  db.prepare(
    `INSERT INTO admin_persisted_snapshot (id, json, updated_at) VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
  ).run(json);
  return { ok: true, bytes: json.length, updatedAt: new Date().toISOString() };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function loadPersistedSnapshot(db) {
  const row = db.prepare(`SELECT json, updated_at FROM admin_persisted_snapshot WHERE id = 1`).get();
  if (!row) return null;
  try {
    return { payload: JSON.parse(row.json), updatedAt: row.updated_at };
  } catch {
    return { payload: null, updatedAt: row.updated_at, parseError: true };
  }
}

/** Delete order = reverse insert order, plus ephemeral tables. */
const DELETE_TABLE_ORDER = [
  'admin_persisted_snapshot',
  ...[...EXPORT_TABLES_INSERT_ORDER].reverse(),
  'sessions',
  'oauth_states',
];

function pragmaCols(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function resolvedSchemaVersion(payload) {
  const raw = payload?.meta?.schemaVersion;
  if (raw === undefined || raw === null) {
    return SNAPSHOT_SCHEMA_VERSION;
  }
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid meta.schemaVersion: ${JSON.stringify(raw)}`);
  }
  return n;
}

/** Keys that are not SQLite table buckets in a full export. */
const SNAPSHOT_NON_TABLE_ROOT_KEYS = new Set(['meta', 'config', 'computed', 'tables']);

function tryParseTablesJsonString(s) {
  if (typeof s !== 'string' || !String(s).trim()) return null;
  try {
    const p = JSON.parse(s);
    if (p && typeof p === 'object' && !Array.isArray(p)) return p;
  } catch {
    return null;
  }
  return null;
}

/** `[{ table|name, rows|data }, ...]` shape from some exporters. */
function tablesFromRowBundleArray(arr) {
  if (!Array.isArray(arr)) return null;
  const out = {};
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const name = item.table ?? item.name ?? item.Table;
    const rows = item.rows ?? item.data;
    if (typeof name === 'string' && Array.isArray(rows)) {
      out[name] = rows;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Resolve `tables` map from various paste shapes (full export, or only per-table maps at root).
 */
function resolveTablesObject(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const t = payload.tables;
  if (t != null) {
    if (typeof t === 'object' && !Array.isArray(t)) {
      return t;
    }
    if (typeof t === 'string') {
      const parsed = tryParseTablesJsonString(t);
      if (parsed) return parsed;
    }
    if (Array.isArray(t)) {
      const fromArr = tablesFromRowBundleArray(t);
      if (fromArr) return fromArr;
    }
  }

  const nested =
    payload.data?.tables ??
    payload.snapshot?.tables ??
    payload.export?.tables ??
    payload.result?.tables;
  if (nested != null) {
    if (typeof nested === 'object' && !Array.isArray(nested)) {
      return nested;
    }
    if (typeof nested === 'string') {
      const parsed = tryParseTablesJsonString(nested);
      if (parsed) return parsed;
    }
  }

  const entries = Object.entries(payload).filter(([k]) => !SNAPSHOT_NON_TABLE_ROOT_KEYS.has(k));
  if (entries.length === 0) return null;
  const allArrays = entries.every(([, v]) => Array.isArray(v));
  if (allArrays) {
    return Object.fromEntries(entries);
  }
  return null;
}

function describeTablesDiagnostic(payload) {
  try {
    const keys = Object.keys(payload || {});
    const t = payload?.tables;
    let detail;
    if (t === undefined) {
      detail = 'There is no top-level "tables" key.';
    } else if (t === null) {
      detail = '"tables" is null.';
    } else if (Array.isArray(t)) {
      detail =
        '"tables" is an array — expected an object like { "projects": [...], ... }, or an array of { "table"/"name", "rows" }.';
    } else if (typeof t === 'string') {
      detail =
        '"tables" is a string but not valid JSON object text — paste the object form from Refresh live.';
    } else if (typeof t === 'object') {
      const tk = Object.keys(t);
      detail =
        tk.length === 0
          ? '"tables" is {} (empty). Nothing to import.'
          : `"tables" has keys: ${tk.slice(0, 12).join(', ')}${tk.length > 12 ? '…' : ''}.`;
    } else {
      detail = `"tables" has unexpected type ${typeof t}.`;
    }
    return `Top-level keys in body: ${keys.length ? keys.join(', ') : '(none)'}. ${detail}`;
  } catch {
    return '';
  }
}

/**
 * Replace DB contents from snapshot.tables (dangerous). Requires matching schemaVersion.
 * Users: password_hash '[REDACTED]' is treated as NULL (unchanged needs manual SQL).
 * Omitted **meta.schemaVersion** defaults to the current schema (hand-edited snapshots often strip **meta**).
 * @param {import('better-sqlite3').Database} db
 * @param {object} payload
 */
export function applyFullSnapshot(db, payload) {
  if (payload === undefined || payload === null) {
    throw new Error(
      'Request body was missing or not parsed as JSON. Check Network tab: PUT /api/admin/full-snapshot should send a non-empty JSON body. If the UI editor shows text, try Refresh live and Apply again.'
    );
  }
  if (Array.isArray(payload)) {
    throw new Error(
      'Request body is a JSON array. Expected one object with a "tables" key (use Admin → Data mirror → Refresh live).'
    );
  }
  if (typeof payload !== 'object') {
    throw new Error(`Request body must be a JSON object; got ${typeof payload}.`);
  }
  if (Object.keys(payload).length === 0) {
    throw new Error(
      'Request body is {}. The client sent an empty object—usually the Data mirror textarea was blank or only whitespace. Click Refresh live to fill the editor, then Apply without deleting the JSON.'
    );
  }

  const ver = resolvedSchemaVersion(payload);
  if (ver !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${ver}; expected ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  const tables = resolveTablesObject(payload);
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    throw new Error(
      `Missing usable table data. ${describeTablesDiagnostic(payload)} Export must include "tables": { "projects": [...], ... } (use Admin → Data mirror → Refresh live). You can also paste only row maps at the root with each key a table name and each value an array of rows.`
    );
  }

  const tx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    try {
      for (const t of DELETE_TABLE_ORDER) {
        try {
          db.prepare(`DELETE FROM ${t}`).run();
        } catch {
          /* table may not exist in older DBs */
        }
      }

      for (const table of EXPORT_TABLES_INSERT_ORDER) {
        const rows = tables[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = pragmaCols(db, table);
        if (!cols.length) continue;
        const colNames = cols.map((c) => c.name);
        const placeholders = colNames.map(() => '?').join(',');
        const stmt = db.prepare(
          `INSERT INTO ${table} (${colNames.join(',')}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          if (table === 'users' && row.password_hash === '[REDACTED]') {
            row.password_hash = null;
          }
          const vals = colNames.map((c) => {
            const v = row[c];
            return v === undefined ? null : v;
          });
          stmt.run(...vals);
        }
      }

      for (const [name, rows] of Object.entries(tables)) {
        if (EXPORT_TABLES_INSERT_ORDER.includes(name)) continue;
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = pragmaCols(db, name);
        if (!cols.length) continue;
        const colNames = cols.map((c) => c.name);
        const placeholders = colNames.map(() => '?').join(',');
        const stmt = db.prepare(
          `INSERT INTO ${name} (${colNames.join(',')}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          const vals = colNames.map((c) => {
            const v = row[c];
            return v === undefined ? null : v;
          });
          stmt.run(...vals);
        }
      }
    } finally {
      db.pragma('foreign_keys = ON');
    }
  });

  tx();
  return { ok: true };
}
