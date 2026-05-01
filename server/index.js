import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { db, nextPublicId } from './db.js';
import { ensureBuiltinAdmin } from './services/builtinAdmin.js';
import { cloneProjectContent } from './services/projectClone.js';
import { extractText, normalizeForMatch } from './services/textExtract.js';
import { buildChangeSummary } from './services/changelog.js';
import { markStaleForNewVersion } from './services/stale.js';
import { binFailures } from './services/regressionBinning.js';
import { computeReleaseReadiness } from './services/releaseProjection.js';
import { loadConfig, saveConfig, sanitizeConfigForPublic } from './config.js';
import { getBuiltinAdminEmail } from './services/builtinAdmin.js';
import { scanRegressionDirectory } from './services/regressionAdapter.js';
import { scanCoverageDirectory } from './services/coverageAdapter.js';
import { scanDirectory as scanVrDirectory, extractTestNameFromLogPath } from './services/vrCoverage.js';
import { syncLegacyArtifacts, versionVrArtifactFromRow } from './services/legacyArtifactSync.js';
import { createArtifactWithFirstVersion } from './services/artifactStore.js';
import { attachAuth, requireApiAuth, authDisabled } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import platformRoutes from './routes/platform.js';
import evidenceRoutes from './routes/evidence.js';
import teamsRoutes from './routes/teams.js';
import {
  requireListAccess,
  requireProjectPermission,
  resolveExplicitProjectId,
  resolveWithDefaultProject,
} from './middleware/permissions.js';
import { accessibleProjectIds, userHasProjectAccess } from './middleware/rbac.js';
import { appendAuditEvent } from './services/auditEvents.js';
import {
  projectIdFromSpec,
  projectIdFromSpecVersion,
  projectIdFromDr,
  projectIdFromVr,
} from './services/projectResolution.js';

function defaultProjectId() {
  const row = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  return row?.id ?? 1;
}

function normalizeLabelInput(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string')
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function parseLabelsJson(s) {
  if (!s) return [];
  try {
    const x = JSON.parse(s);
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}

function validateRequirementCategory(category, cfg) {
  const allowed = cfg.requirementCategories || [];
  if (!category || typeof category !== 'string') return 'category is required';
  const t = category.trim();
  if (!allowed.length) return null;
  if (!allowed.includes(t)) return `category must be one of: ${allowed.join(', ')}`;
  return null;
}

function mapVrToClient(v, extra = {}) {
  const linkStmt = db.prepare(`
    SELECT dr.public_id FROM vr_dr_links v JOIN drs dr ON v.dr_id = dr.id WHERE v.vr_id = ?
  `);
  const staleStmt = db.prepare(`
    SELECT MAX(dr.stale) AS s FROM vr_dr_links v JOIN drs dr ON v.dr_id = dr.id WHERE v.vr_id = ?
  `);
  const covStmt = db.prepare(`SELECT hits FROM vr_coverage WHERE vr_id = ?`);
  let evidence_links = [];
  try {
    evidence_links = v.evidence_links ? JSON.parse(v.evidence_links) : [];
  } catch {
    evidence_links = [];
  }
  const cov = covStmt.get(v.id);
  const orphanStale = Boolean(v.stale);
  const regressionLogs = extra.regression_logs || [];
  const testsFromLogs = [...new Set(regressionLogs.map((x) => x.test).filter(Boolean))];
  return {
    ...v,
    labels: parseLabelsJson(v.labels),
    evidence_links,
    linked_dr_public_ids: linkStmt.all(v.id).map((r) => r.public_id),
    stale_from_dr: Boolean(staleStmt.get(v.id)?.s),
    orphan_stale: orphanStale,
    stale_reason: v.stale_reason || null,
    coverage_hits: cov?.hits || 0,
    covered: Boolean(cov && cov.hits > 0),
    regression_logs: regressionLogs,
    regression_log_count: regressionLogs.length,
    tests_from_logs: testsFromLogs,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

ensureBuiltinAdmin();
syncLegacyArtifacts();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use(attachAuth);
app.use('/api/auth', authRoutes);
app.use('/api', requireApiAuth);
app.use('/api', platformRoutes);
app.use('/api', evidenceRoutes);
app.use('/api', teamsRoutes);

const upload = multer({ dest: uploadsDir });

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'hoverboard-api' });
});

app.get('/api/config', (_req, res) => {
  const cfg = loadConfig();
  const oidc = cfg.auth?.oidc || {};
  const oidcConfigured = Boolean(
    oidc.issuerUrl && oidc.clientId && oidc.clientSecret && oidc.redirectUri
  );
  const safe = sanitizeConfigForPublic(cfg);
  res.json({
    ...safe,
    authUi: {
      authDisabled: authDisabled(),
      localLoginEnabled: cfg.auth?.localLoginEnabled !== false,
      oidcConfigured,
      ldapLoginEnabled: Boolean(cfg.auth?.ldap?.enabled && cfg.auth?.ldap?.url),
      builtinLoginUsername: cfg.auth?.builtinAdmin?.username?.trim() || 'admin',
      builtinAdminEmail: getBuiltinAdminEmail(),
    },
  });
});

app.put(
  '/api/config',
  requireProjectPermission('settings_write', resolveWithDefaultProject),
  (req, res) => {
    try {
      const body = req.body || {};
      const { authUi: _authUi, ...rest } = body;
      const next = saveConfig(rest);
      ensureBuiltinAdmin();
      res.json({
        ...sanitizeConfigForPublic(next),
        authUi: {
          authDisabled: authDisabled(),
          localLoginEnabled: next.auth?.localLoginEnabled !== false,
          oidcConfigured: Boolean(
            next.auth?.oidc?.issuerUrl &&
              next.auth?.oidc?.clientId &&
              next.auth?.oidc?.clientSecret &&
              next.auth?.oidc?.redirectUri
          ),
          ldapLoginEnabled: Boolean(next.auth?.ldap?.enabled && next.auth?.ldap?.url),
          builtinLoginUsername: next.auth?.builtinAdmin?.username?.trim() || 'admin',
          builtinAdminEmail: getBuiltinAdminEmail(),
        },
      });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  }
);

function slugifyProjectName(name) {
  const s = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'project';
}

app.get('/api/projects', (req, res) => {
  const cols = `id, slug, name, description, status, created_at`;
  if (authDisabled()) {
    return res.json(db.prepare(`SELECT ${cols} FROM projects ORDER BY id`).all());
  }
  const u = req.authUser;
  if (!u?.id) return res.status(401).json({ error: 'authentication required' });
  if (u.global_roles?.includes('system_admin')) {
    return res.json(db.prepare(`SELECT ${cols} FROM projects ORDER BY id`).all());
  }
  const ids = accessibleProjectIds(u);
  if (!ids?.length) return res.json([]);
  const ph = ids.map(() => '?').join(',');
  res.json(db.prepare(`SELECT ${cols} FROM projects WHERE id IN (${ph}) ORDER BY id`).all(...ids));
});

app.get('/api/projects/:projectId', (req, res) => {
  const pid = Number(req.params.projectId);
  if (!Number.isFinite(pid)) return res.status(400).json({ error: 'invalid project id' });
  const cols = `id, slug, name, description, status, created_at`;
  if (authDisabled()) {
    const row = db.prepare(`SELECT ${cols} FROM projects WHERE id = ?`).get(pid);
    return row ? res.json(row) : res.status(404).json({ error: 'not found' });
  }
  const u = req.authUser;
  if (!u?.id) return res.status(401).json({ error: 'authentication required' });
  if (!userHasProjectAccess(u, pid)) return res.status(403).json({ error: 'forbidden' });
  const row = db.prepare(`SELECT ${cols} FROM projects WHERE id = ?`).get(pid);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

app.post('/api/projects', (req, res) => {
  if (!req.authUser?.id) return res.status(401).json({ error: 'authentication required' });
  const { name, description, copy_from_project_id: copyFromBody } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  const copyFrom =
    copyFromBody != null && copyFromBody !== '' ? Number(copyFromBody) : null;
  if (copyFrom != null && (!Number.isFinite(copyFrom) || copyFrom <= 0)) {
    return res.status(400).json({ error: 'invalid copy_from_project_id' });
  }
  if (copyFrom != null && !userHasProjectAccess(req.authUser, copyFrom)) {
    return res.status(403).json({ error: 'cannot clone from this project' });
  }
  let slug = slugifyProjectName(name);
  const clash = db.prepare(`SELECT id FROM projects WHERE slug = ?`).get(slug);
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;
  const desc = description != null && String(description).trim() ? String(description).trim() : null;
  try {
    const row = db
      .prepare(
        `INSERT INTO projects (slug, name, description, status) VALUES (?, ?, ?, 'active') RETURNING id, slug, name, description, status, created_at`
      )
      .get(slug, String(name).trim(), desc);
    db.prepare(`INSERT INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, 'project_admin')`).run(
      req.authUser.id,
      row.id
    );
    try {
      if (copyFrom != null) {
        cloneProjectContent(copyFrom, row.id, uploadsDir);
        syncLegacyArtifacts();
      }
    } catch (cloneErr) {
      db.prepare(`DELETE FROM user_project_roles WHERE project_id = ?`).run(row.id);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(row.id);
      return res.status(500).json({ error: `project clone failed: ${cloneErr.message}` });
    }
    appendAuditEvent({
      actorUserId: req.authUser.id,
      action: 'PROJECT_CREATE',
      entityType: 'PROJECT',
      entityId: String(row.id),
      detail: { slug: row.slug, name: row.name, copy_from_project_id: copyFrom ?? undefined },
      mirrorLegacy: true,
    });
    res.status(201).json(row);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'slug conflict' });
    throw e;
  }
});

/** --- Specs --- */
function normalizeFolderPath(p) {
  if (!p) return null;
  const cleaned = String(p)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
  return cleaned || null;
}

app.post(
  '/api/specs',
  requireProjectPermission(
    'specs_write',
    (req) => Number(req.body?.project_id) || resolveExplicitProjectId(req)
  ),
  (req, res) => {
    const { name, identifier } = req.body || {};
    if (!name || !identifier) {
      return res.status(400).json({ error: 'name and identifier required' });
    }
    const folder = normalizeFolderPath(req.body?.folder_path);
    const description = req.body?.description ? String(req.body.description) : null;
    const projectId = req.resolvedProjectId;
    try {
      const r = db
        .prepare(
          `INSERT INTO specs (identifier, name, folder_path, description, project_id) VALUES (?, ?, ?, ?, ?) RETURNING id`
        )
        .get(identifier.trim(), name.trim(), folder, description, projectId);
      db.prepare(
        `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('SPEC', ?, 'CREATE')`
      ).run(String(r.id));
      res.status(201).json({
        id: r.id,
        identifier: identifier.trim(),
        name: name.trim(),
        folder_path: folder,
        description,
      });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'identifier already exists' });
      }
      throw e;
    }
  }
);

app.get('/api/specs', requireListAccess('specs_read'), (req, res) => {
  const q = String(req.query.q || '').trim();
  let sql = `SELECT * FROM specs WHERE 1=1`;
  const params = [];
  if (req.listProjectIds !== null) {
    const ph = req.listProjectIds.map(() => '?').join(',');
    sql += ` AND project_id IN (${ph})`;
    params.push(...req.listProjectIds);
  }
  if (q) {
    const qq = `%${q}%`;
    sql += ' AND (name LIKE ? OR identifier LIKE ? OR IFNULL(folder_path, "") LIKE ?)';
    params.push(qq, qq, qq);
  }
  sql += ' ORDER BY id DESC';
  const specs = db.prepare(sql).all(...params);
  const out = specs.map((s) => {
    const versions = db
      .prepare(
        `SELECT id, version, original_filename, uploaded_at FROM spec_versions WHERE spec_id = ? ORDER BY id DESC`
      )
      .all(s.id);
    return { ...s, versions };
  });
  res.json(out);
});

app.post(
  '/api/specs/:specId/versions',
  upload.single('file'),
  requireProjectPermission('specs_write', (req) => projectIdFromSpec(Number(req.params.specId))),
  async (req, res) => {
  const specId = Number(req.params.specId);
  const version = (req.body.version || '').trim();
  if (!version || !req.file) {
    return res.status(400).json({ error: 'version and file required' });
  }
  const spec = db.prepare(`SELECT * FROM specs WHERE id = ?`).get(specId);
  if (!spec) return res.status(404).json({ error: 'spec not found' });

  const mime = req.file.mimetype;
  const orig = req.file.originalname || 'upload';
  let extracted = '';
  try {
    extracted = await extractText(req.file.path, mime, orig);
  } catch (e) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: `Extract failed: ${e.message}` });
  }

  const prev = db
    .prepare(
      `SELECT extracted_text FROM spec_versions WHERE spec_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(specId);
  const changelog = prev?.extracted_text
    ? buildChangeSummary(prev.extracted_text, extracted)
    : { summary: 'Initial version', additions: [], removals: [], stats: {} };

  const destName = `${specId}_${version}_${Date.now()}_${path.basename(orig)}`;
  const destPath = path.join(uploadsDir, destName);
  fs.renameSync(req.file.path, destPath);

  const vr = db
    .prepare(
      `
    INSERT INTO spec_versions (spec_id, version, original_filename, mime_type, storage_path, extracted_text, changelog)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
  `
    )
    .get(
      specId,
      version,
      orig,
      mime,
      destName,
      extracted,
      JSON.stringify(changelog)
    );

  db.prepare(`UPDATE specs SET latest_version_id = ? WHERE id = ?`).run(vr.id, specId);

  const staleResult = markStaleForNewVersion(db, specId, extracted);

  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES ('SPEC_VERSION', ?, 'UPLOAD', ?)`
  ).run(String(vr.id), JSON.stringify({ changelog: changelog.summary, staleMarked: staleResult.marked }));

  res.status(201).json({
    id: vr.id,
    version,
    changelog,
    staleMarked: staleResult.marked,
  });
  }
);

app.delete(
  '/api/specs/:id',
  requireProjectPermission('specs_write', (req) => projectIdFromSpec(Number(req.params.id))),
  (req, res) => {
  const id = Number(req.params.id);
  const spec = db.prepare(`SELECT * FROM specs WHERE id = ?`).get(id);
  if (!spec) return res.status(404).json({ error: 'spec not found' });

  const versions = db.prepare(`SELECT id, storage_path FROM spec_versions WHERE spec_id = ?`).all(id);
  const versionIds = versions.map((v) => v.id);

  const remove = db.transaction(() => {
    if (versionIds.length) {
      const placeholders = versionIds.map(() => '?').join(',');
      const drsRows = db
        .prepare(`SELECT id FROM drs WHERE spec_version_id IN (${placeholders})`)
        .all(...versionIds);
      const drIds = drsRows.map((r) => r.id);
      if (drIds.length) {
        const drPh = drIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM vr_dr_links WHERE dr_id IN (${drPh})`).run(...drIds);
        db.prepare(`DELETE FROM drs WHERE id IN (${drPh})`).run(...drIds);
      }
      db.prepare(`DELETE FROM spec_versions WHERE id IN (${placeholders})`).run(...versionIds);
    }
    db.prepare(`UPDATE specs SET latest_version_id = NULL WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM specs WHERE id = ?`).run(id);
  });

  try {
    remove();
  } catch (e) {
    return res.status(500).json({ error: `delete failed: ${e.message}` });
  }

  for (const v of versions) {
    if (!v.storage_path) continue;
    const p = path.join(uploadsDir, path.basename(v.storage_path));
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES ('SPEC', ?, 'DELETE', ?)`
  ).run(String(id), JSON.stringify({ name: spec.name, identifier: spec.identifier }));

  res.json({ ok: true, deletedSpec: spec.identifier, removedVersions: versionIds.length });
  }
);

app.get(
  '/api/spec-versions/:vid',
  requireProjectPermission('specs_read', (req) => projectIdFromSpecVersion(Number(req.params.vid))),
  (req, res) => {
  const vid = Number(req.params.vid);
  const row = db.prepare(`SELECT * FROM spec_versions WHERE id = ?`).get(vid);
  if (!row) return res.status(404).json({ error: 'not found' });
  const fileUrl = `/uploads/${path.basename(row.storage_path)}`;
  res.json({
    ...row,
    changelog: row.changelog ? JSON.parse(row.changelog) : null,
    fileUrl,
  });
  }
);

app.get(
  '/api/spec-versions/:vid/html',
  requireProjectPermission('specs_read', (req) => projectIdFromSpecVersion(Number(req.params.vid))),
  async (req, res) => {
  const vid = Number(req.params.vid);
  const row = db.prepare(`SELECT * FROM spec_versions WHERE id = ?`).get(vid);
  if (!row) return res.status(404).json({ error: 'not found' });
  const fullPath = path.join(uploadsDir, path.basename(row.storage_path));
  if (
    row.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    row.original_filename?.toLowerCase().endsWith('.docx')
  ) {
    const mammothMod = await import('mammoth');
    const mammoth = mammothMod.default || mammothMod;
    const buf = fs.readFileSync(fullPath);
    const result = await mammoth.convertToHtml({ buffer: buf });
    res.json({ html: result.value || '' });
    return;
  }
  res.json({ html: null });
});

/** --- DRs --- */
app.get(
  '/api/drs/peek',
  requireProjectPermission('drs_read', resolveWithDefaultProject),
  (_req, res) => {
    const row = db.prepare(`SELECT value FROM counters WHERE key = 'dr'`).get();
    const next = (row?.value || 0) + 1;
    res.json({ next_public_id: `DR-${String(next).padStart(5, '0')}` });
  }
);

app.post(
  '/api/drs',
  requireProjectPermission('drs_write', (req) =>
    projectIdFromSpecVersion(Number(req.body?.specVersionId))
  ),
  (req, res) => {
  const body = req.body || {};
  const { specVersionId, excerpt, anchor_hint, asil } = body;
  if (!specVersionId || !excerpt) {
    return res.status(400).json({ error: 'specVersionId and excerpt required' });
  }
  const cfg = loadConfig();
  const catErr = validateRequirementCategory(body.category, cfg);
  if (catErr) return res.status(400).json({ error: catErr });

  const sv = db
    .prepare(
      `SELECT sv.*, s.id AS spec_id, s.identifier AS spec_identifier, s.name AS spec_name
       FROM spec_versions sv JOIN specs s ON sv.spec_id = s.id WHERE sv.id = ?`
    )
    .get(specVersionId);
  if (!sv) return res.status(404).json({ error: 'spec version not found' });

  const labelsJson = JSON.stringify(normalizeLabelInput(body.labels));
  const specReference =
    body.spec_reference?.trim() ||
    `${sv.spec_name} · v${sv.version} · ${sv.spec_identifier}`;

  const publicId = nextPublicId('DR', 'dr');
  const projectRow = db
    .prepare(`SELECT s.project_id FROM spec_versions sv JOIN specs s ON s.id = sv.spec_id WHERE sv.id = ?`)
    .get(specVersionId);
  const projectId = projectRow?.project_id || db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get().id;
  const actorId = req.authUser?.id ?? null;

  const ins = db
    .prepare(
      `
    INSERT INTO drs (public_id, spec_version_id, excerpt, anchor_hint, asil, category, labels, status, priority, description, comments, spec_reference, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `
    )
    .get(
      publicId,
      specVersionId,
      String(excerpt).trim(),
      anchor_hint || null,
      asil || null,
      body.category.trim(),
      labelsJson,
      body.status || 'open',
      body.priority || null,
      body.description || null,
      body.comments || null,
      specReference,
      projectId
    );

  const content = {
    kind: 'DR',
    public_id: publicId,
    excerpt: String(excerpt).trim(),
    spec_version_id: specVersionId,
    category: body.category.trim(),
    labels: normalizeLabelInput(body.labels),
    status: body.status || 'open',
    priority: body.priority || null,
    description: body.description || null,
    comments: body.comments || null,
    spec_reference: specReference,
    asil: asil || null,
    stale: 0,
  };
  const graph = createArtifactWithFirstVersion(db, {
    project_id: projectId,
    artifact_type: 'DR',
    external_id: publicId,
    title: String(excerpt).trim().slice(0, 120),
    status: body.status || 'open',
    asil_level: asil || null,
    content_json: content,
    created_by_user_id: actorId,
    legacy_table: 'drs',
    legacy_row_id: ins.id,
  });
  db.prepare(`UPDATE drs SET artifact_id = ? WHERE id = ?`).run(graph.artifact_id, ins.id);

  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('DR', ?, 'CREATE')`
  ).run(publicId);

  res.status(201).json({ id: ins.id, public_id: publicId, spec_reference: specReference });
  }
);

app.get('/api/drs', requireListAccess('drs_read'), (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim() || null;
  const status = String(req.query.status || '').trim() || null;
  const priority = String(req.query.priority || '').trim() || null;

  let sql = `
    SELECT drs.*, sv.version AS spec_version_label, sv.spec_id, s.identifier AS spec_identifier
    FROM drs
    JOIN spec_versions sv ON drs.spec_version_id = sv.id
    JOIN specs s ON sv.spec_id = s.id
    WHERE 1=1`;
  const params = [];
  if (req.listProjectIds !== null) {
    const ph = req.listProjectIds.map(() => '?').join(',');
    sql += ` AND s.project_id IN (${ph})`;
    params.push(...req.listProjectIds);
  }
  if (category) {
    sql += ' AND drs.category = ?';
    params.push(category);
  }
  if (status) {
    sql += ' AND drs.status = ?';
    params.push(status);
  }
  if (priority) {
    sql += ' AND drs.priority = ?';
    params.push(priority);
  }
  if (q) {
    const qq = `%${q}%`;
    sql +=
      ' AND (drs.excerpt LIKE ? OR drs.public_id LIKE ? OR IFNULL(drs.labels, "") LIKE ? OR IFNULL(drs.category, "") LIKE ?)';
    params.push(qq, qq, qq, qq);
  }
  sql += ' ORDER BY drs.id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(
    rows.map((r) => ({
      ...r,
      labels: parseLabelsJson(r.labels),
    }))
  );
});

app.delete(
  '/api/drs/:publicId',
  (req, res, next) => {
    const dr = db.prepare(`SELECT * FROM drs WHERE public_id = ?`).get(req.params.publicId);
    if (!dr) return res.status(404).json({ error: 'not found' });
    req._drRow = dr;
    next();
  },
  requireProjectPermission('drs_write', (req) => projectIdFromDr(req._drRow.id)),
  (req, res) => {
    const dr = req._drRow;
    const mode = String(req.query.orphan_vrs || 'stale').toLowerCase();
    const deleteOrphans = mode === 'delete';

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM iso_evidence WHERE dr_id = ?`).run(dr.id);

      const linkedVrs = db.prepare(`SELECT vr_id FROM vr_dr_links WHERE dr_id = ?`).all(dr.id);
      for (const { vr_id } of linkedVrs) {
        const n = db.prepare(`SELECT COUNT(*) AS c FROM vr_dr_links WHERE vr_id = ?`).get(vr_id).c;
        if (n !== 1) continue;
        const vrRow = db.prepare(`SELECT * FROM vrs WHERE id = ?`).get(vr_id);
        if (!vrRow) continue;
        if (deleteOrphans) {
          db.prepare(`DELETE FROM iso_evidence WHERE vr_id = ?`).run(vr_id);
          if (vrRow.artifact_id) {
            db.prepare(
              `DELETE FROM artifact_links WHERE source_artifact_id = ? OR target_artifact_id = ?`
            ).run(vrRow.artifact_id, vrRow.artifact_id);
            try {
              db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(vrRow.artifact_id);
            } catch {
              /* FK e.g. baseline */
            }
          }
          db.prepare(`DELETE FROM vrs WHERE id = ?`).run(vr_id);
        } else {
          db.prepare(
            `UPDATE vrs SET stale = 1, stale_reason = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(`Sole linked DR ${dr.public_id} was deleted`, vr_id);
        }
      }

      if (dr.artifact_id) {
        db.prepare(`DELETE FROM artifact_links WHERE source_artifact_id = ? OR target_artifact_id = ?`).run(
          dr.artifact_id,
          dr.artifact_id
        );
        try {
          db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(dr.artifact_id);
        } catch {
          /* FK e.g. baseline */
        }
      }

      db.prepare(`DELETE FROM drs WHERE id = ?`).run(dr.id);
    });

    try {
      tx();
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }

    appendAuditEvent({
      actorUserId: req.authUser?.id,
      action: 'DR_DELETE',
      entityType: 'DR',
      entityId: dr.public_id,
      detail: { orphan_vrs: deleteOrphans ? 'delete' : 'stale' },
      mirrorLegacy: true,
    });

    db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('DR', ?, 'DELETE')`).run(
      dr.public_id
    );

    res.json({ ok: true, deleted_public_id: dr.public_id, orphan_vrs: deleteOrphans ? 'delete' : 'stale' });
  }
);

/** --- VRs --- */
app.post(
  '/api/vrs',
  requireProjectPermission('vrs_write', (req) => {
    const ids = Array.isArray(req.body?.drPublicIds) ? req.body.drPublicIds : [];
    const findDr = db.prepare(`SELECT id FROM drs WHERE public_id = ?`);
    if (!ids.length) return null;
    const dr = findDr.get(ids[0]);
    return dr ? projectIdFromDr(dr.id) : null;
  }),
  (req, res) => {
    const body = req.body || {};
    const { title, description } = body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const cfg = loadConfig();
    const catErr = validateRequirementCategory(body.category, cfg);
    if (catErr) return res.status(400).json({ error: catErr });

    const ids = Array.isArray(body.drPublicIds) ? body.drPublicIds : [];
    const findDr = db.prepare(`SELECT id FROM drs WHERE public_id = ?`);
    const resolvedIds = [];
    for (const pid of ids) {
      const dr = findDr.get(pid);
      if (dr) resolvedIds.push(dr.id);
    }
    if (resolvedIds.length === 0) {
      return res.status(400).json({
        error: 'At least one linked DR is required. Only existing DR public IDs can be linked.',
      });
    }

  const labelsJson = JSON.stringify(normalizeLabelInput(body.labels));

  const drProj = db
    .prepare(
      `
    SELECT s.project_id FROM drs d
    JOIN spec_versions sv ON sv.id = d.spec_version_id
    JOIN specs s ON s.id = sv.spec_id
    WHERE d.id = ?
  `
    )
    .get(resolvedIds[0]);
  const projectId = drProj?.project_id ?? defaultProjectId();
  const actorId = req.authUser?.id ?? null;

  const publicId = nextPublicId('VR', 'vr');
  const vr = db
    .prepare(
      `
    INSERT INTO vrs (public_id, title, description, status, priority, owner, location_scope, verification_method, milestone_gate, evidence_links, last_verified, asil, category, labels, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?) RETURNING id
  `
    )
    .get(
      publicId,
      title.trim(),
      description || '',
      body.status || 'draft',
      body.priority || null,
      body.owner || null,
      body.location_scope || null,
      body.evidence_links ? JSON.stringify(body.evidence_links) : null,
      body.last_verified || null,
      body.asil || null,
      body.category.trim(),
      labelsJson,
      projectId
    );

  const link = db.prepare(`INSERT INTO vr_dr_links (vr_id, dr_id) VALUES (?, ?)`);
  for (const drId of resolvedIds) {
    link.run(vr.id, drId);
  }

  const content = {
    kind: 'VR',
    public_id: publicId,
    title: title.trim(),
    description: description || '',
    status: body.status || 'draft',
    priority: body.priority || null,
    category: body.category.trim(),
    labels: normalizeLabelInput(body.labels),
    asil: body.asil || null,
  };
  const graph = createArtifactWithFirstVersion(db, {
    project_id: projectId,
    artifact_type: 'VR',
    external_id: publicId,
    title: title.trim(),
    status: body.status || 'draft',
    asil_level: body.asil || null,
    content_json: content,
    created_by_user_id: actorId,
    legacy_table: 'vrs',
    legacy_row_id: vr.id,
  });
  db.prepare(`UPDATE vrs SET artifact_id = ? WHERE id = ?`).run(graph.artifact_id, vr.id);

  const drArtStmt = db.prepare(`SELECT artifact_id FROM drs WHERE id = ?`);
  const insertLink = db.prepare(
    `INSERT INTO artifact_links (source_artifact_id, target_artifact_id, link_type, link_status) VALUES (?, ?, 'verifies', 'valid')`
  );
  for (const drId of resolvedIds) {
    const da = drArtStmt.get(drId);
    if (da?.artifact_id) {
      insertLink.run(graph.artifact_id, da.artifact_id);
    }
  }

  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('VR', ?, 'CREATE')`
  ).run(publicId);

  res.status(201).json({ id: vr.id, public_id: publicId });
  }
);

app.patch(
  '/api/vrs/:publicId',
  requireProjectPermission('vrs_write', (req) => {
    const row = db.prepare(`SELECT id FROM vrs WHERE public_id = ?`).get(req.params.publicId);
    return row ? projectIdFromVr(row.id) : null;
  }),
  (req, res) => {
    const { publicId } = req.params;
    const body = req.body || {};
    const existing = db.prepare(`SELECT * FROM vrs WHERE public_id = ?`).get(publicId);
    if (!existing) return res.status(404).json({ error: 'not found' });

  const cfg = loadConfig();
  if (body.category !== undefined) {
    const err = validateRequirementCategory(body.category, cfg);
    if (err) return res.status(400).json({ error: err });
  }

  const fields = [
    'title',
    'description',
    'status',
    'priority',
    'owner',
    'location_scope',
    'last_verified',
    'asil',
    'evidence_links',
    'category',
  ];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      if (f === 'evidence_links') vals.push(JSON.stringify(body[f]));
      else vals.push(body[f]);
    }
  }
  if (body.labels !== undefined) {
    sets.push(`labels = ?`);
    vals.push(JSON.stringify(normalizeLabelInput(body.labels)));
  }
  sets.push(`updated_at = datetime('now')`);
  vals.push(publicId);
  db.prepare(`UPDATE vrs SET ${sets.join(', ')} WHERE public_id = ?`).run(...vals);

  if (Array.isArray(body.drPublicIds)) {
    const findDr = db.prepare(`SELECT id FROM drs WHERE public_id = ?`);
    const resolved = [];
    for (const pid of body.drPublicIds) {
      const dr = findDr.get(pid);
      if (dr) resolved.push(dr.id);
    }
    if (resolved.length === 0) {
      return res.status(400).json({
        error: 'At least one linked DR is required. Only existing DR public IDs can be linked.',
      });
    }
    db.prepare(`DELETE FROM vr_dr_links WHERE vr_id = ?`).run(existing.id);
    const link = db.prepare(`INSERT INTO vr_dr_links (vr_id, dr_id) VALUES (?, ?)`);
    for (const drId of resolved) {
      link.run(existing.id, drId);
    }
  }

  const row = db.prepare(`SELECT * FROM vrs WHERE public_id = ?`).get(publicId);
  if (row?.artifact_id) {
    versionVrArtifactFromRow(row, req.authUser?.id ?? null);
  }

  res.json(mapVrToClient(row));
  }
);

app.delete(
  '/api/vrs/:publicId',
  (req, res, next) => {
    const vr = db.prepare(`SELECT * FROM vrs WHERE public_id = ?`).get(req.params.publicId);
    if (!vr) return res.status(404).json({ error: 'not found' });
    req._vrRow = vr;
    next();
  },
  requireProjectPermission('vrs_write', (req) => projectIdFromVr(req._vrRow.id)),
  (req, res) => {
    const vr = req._vrRow;
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM iso_evidence WHERE vr_id = ?`).run(vr.id);
      if (vr.artifact_id) {
        db.prepare(`DELETE FROM artifact_links WHERE source_artifact_id = ? OR target_artifact_id = ?`).run(
          vr.artifact_id,
          vr.artifact_id
        );
        try {
          db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(vr.artifact_id);
        } catch {
          /* FK e.g. baseline */
        }
      }
      db.prepare(`DELETE FROM vrs WHERE id = ?`).run(vr.id);
    });
    try {
      tx();
    } catch (e) {
      return res.status(500).json({ error: String(e.message || e) });
    }

    appendAuditEvent({
      actorUserId: req.authUser?.id,
      action: 'VR_DELETE',
      entityType: 'VR',
      entityId: vr.public_id,
      detail: {},
      mirrorLegacy: true,
    });

    db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('VR', ?, 'DELETE')`).run(
      vr.public_id
    );

    res.json({ ok: true, deleted_public_id: vr.public_id });
  }
);

app.get('/api/vrs', requireListAccess('vrs_read'), (req, res) => {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim() || null;
  const status = String(req.query.status || '').trim() || null;
  const priority = String(req.query.priority || '').trim() || null;

  let sql = 'SELECT * FROM vrs WHERE 1=1';
  const params = [];
  if (req.listProjectIds !== null) {
    const ph = req.listProjectIds.map(() => '?').join(',');
    sql += ` AND project_id IN (${ph})`;
    params.push(...req.listProjectIds);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (priority) {
    sql += ' AND priority = ?';
    params.push(priority);
  }
  if (q) {
    const qq = `%${q}%`;
    sql +=
      ' AND (title LIKE ? OR IFNULL(description, "") LIKE ? OR public_id LIKE ? OR IFNULL(labels, "") LIKE ? OR IFNULL(category, "") LIKE ?)';
    params.push(qq, qq, qq, qq, qq);
  }
  sql += ' ORDER BY id DESC';
  const vrs = db.prepare(sql).all(...params);
  const ids = vrs.map((r) => r.id);
  const logsByVr = {};
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const fileRows = db
      .prepare(
        `SELECT vr_id, file_path, test_name FROM vr_coverage_files WHERE vr_id IN (${ph}) ORDER BY file_path`
      )
      .all(...ids);
    for (const fr of fileRows) {
      if (!logsByVr[fr.vr_id]) logsByVr[fr.vr_id] = [];
      logsByVr[fr.vr_id].push({
        path: fr.file_path,
        test: fr.test_name,
      });
    }
  }
  res.json(vrs.map((v) => mapVrToClient(v, { regression_logs: logsByVr[v.id] || [] })));
});

/** --- Metrics & release --- */
app.get(
  '/api/metrics',
  requireProjectPermission('metrics_read', resolveWithDefaultProject),
  (req, res) => {
  const pid = req.resolvedProjectId;
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
    .prepare(
      `SELECT value FROM coverage_metrics WHERE kind = 'functional' ORDER BY id DESC LIMIT 1`
    )
    .get();
  const cdRow = db
    .prepare(`SELECT value FROM coverage_metrics WHERE kind = 'code' ORDER BY id DESC LIMIT 1`)
    .get();
  const functionalCoverage = fnRow ? Math.round(Number(fnRow.value)) : 0;
  const codeCoverage = cdRow ? Math.round(Number(cdRow.value)) : 0;
  const vrCoverage = vrTotal ? Math.round((vrCovered / vrTotal) * 100) : 0;

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

  res.json({
    functionalCoverage,
    codeCoverage,
    vrCoverage,
    drCoverage: drClosure,
    drTotal,
    drStale,
    drCovered,
    vrTotal,
    vrCovered,
    regressionSignatures: sigs,
    passRate,
    releaseReadiness: readiness,
  });
  }
);

app.get(
  '/api/release-readiness',
  requireProjectPermission('metrics_read', resolveWithDefaultProject),
  (_req, res) => {
  const m = db.prepare(`SELECT COUNT(*) AS n FROM drs`).get().n;
  const cfg = loadConfig();
  const readiness = computeReleaseReadiness(
    {
      passRate: 88,
      functionalCoverage: Math.min(95, m * 5 + 50),
      codeCoverage: 72,
      vrCoverage: 65,
      drClosure: m ? 80 : 0,
    },
    cfg.releaseMetricWeights || {},
    []
  );
  res.json(readiness);
  }
);

/** --- Regressions --- */
app.post(
  '/api/regressions/ingest',
  requireProjectPermission('regressions_write', resolveWithDefaultProject),
  (req, res) => {
  const { failures, lines } = req.body || {};
  const raw = Array.isArray(failures)
    ? failures.map((f) => String(f))
    : Array.isArray(lines)
      ? lines.map((l) => String(l))
      : [];
  const bins = binFailures(raw);
  let inserted = 0;
  const upsert = db.prepare(`
    INSERT INTO regression_signatures (signature_key, title, category, class, state, total, trend_json)
    VALUES (@signature_key, @title, 'regression', 'fail', 'OPEN', @total, @trend_json)
    ON CONFLICT(signature_key) DO UPDATE SET
      total = regression_signatures.total + excluded.total,
      title = excluded.title
  `);
  for (const b of bins) {
    upsert.run({
      signature_key: b.signature_key,
      title: b.title,
      total: b.total,
      trend_json: JSON.stringify([b.total]),
    });
    inserted++;
    const sig = db
      .prepare(`SELECT id FROM regression_signatures WHERE signature_key = ?`)
      .get(b.signature_key);
    db.prepare(
      `INSERT INTO regression_activity (signature_id, action, reference, state) VALUES (?, ?, ?, ?)`
    ).run(sig.id, 'ingest', b.sample, 'OPEN');
  }
  res.json({ signaturesUpserted: inserted, bins: bins.length });
  }
);

app.get(
  '/api/regressions/signatures',
  requireProjectPermission('regressions_read', resolveWithDefaultProject),
  (_req, res) => {
  const rows = db.prepare(`SELECT * FROM regression_signatures ORDER BY total DESC`).all();
  res.json(rows.map((r) => ({ ...r, trend: r.trend_json ? JSON.parse(r.trend_json) : [] })));
  }
);

app.get(
  '/api/regressions/signatures/:key',
  requireProjectPermission('regressions_read', resolveWithDefaultProject),
  (req, res) => {
  const k = req.params.key;
  const row = db
    .prepare(
      `SELECT * FROM regression_signatures WHERE signature_key = ? OR CAST(id AS TEXT) = ?`
    )
    .get(k, k);
  if (!row) return res.status(404).json({ error: 'not found' });
  const acts = db
    .prepare(`SELECT * FROM regression_activity WHERE signature_id = ? ORDER BY id DESC LIMIT 100`)
    .all(row.id);
  res.json({ ...row, activity: acts });
  }
);

/** Ingest from a server-visible regression directory using configured adapter */
app.post(
  '/api/regressions/ingest-directory',
  requireProjectPermission('regressions_write', resolveWithDefaultProject),
  (req, res) => {
  const dir = String(req.body?.path || '').trim();
  if (!dir) return res.status(400).json({ error: 'path required' });
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: `directory not visible to API: ${dir}` });
  }
  const cfg = loadConfig();
  const result = scanRegressionDirectory(dir, { patterns: cfg.regressionParsers });
  let inserted = 0;
  const upsert = db.prepare(`
    INSERT INTO regression_signatures (signature_key, title, category, class, state, total, trend_json)
    VALUES (@signature_key, @title, 'regression', 'fail', 'OPEN', @total, @trend_json)
    ON CONFLICT(signature_key) DO UPDATE SET
      total = regression_signatures.total + excluded.total,
      title = excluded.title
  `);
  for (const b of result.bins) {
    upsert.run({
      signature_key: b.signature_key,
      title: b.title,
      total: b.total,
      trend_json: JSON.stringify([b.total]),
    });
    inserted++;
    const sig = db
      .prepare(`SELECT id FROM regression_signatures WHERE signature_key = ?`)
      .get(b.signature_key);
    db.prepare(
      `INSERT INTO regression_activity (signature_id, action, reference, state) VALUES (?, ?, ?, ?)`
    ).run(sig.id, 'directory ingest', dir, 'OPEN');
  }
  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES ('REGRESSION', ?, 'INGEST_DIR', ?)`
  ).run(dir, JSON.stringify({ filesScanned: result.filesScanned, failures: result.failures, bins: inserted }));
  res.json({ ok: true, ...result, signaturesUpserted: inserted });
  }
);

/** Coverage from a server-visible directory */
app.post(
  '/api/coverage/ingest-directory',
  requireProjectPermission('regressions_write', resolveWithDefaultProject),
  (req, res) => {
  const dir = String(req.body?.path || '').trim();
  if (!dir) return res.status(400).json({ error: 'path required' });
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: `directory not visible to API: ${dir}` });
  }
  const cfg = loadConfig();
  const result = scanCoverageDirectory(dir, { regex: cfg.coverageRegex });
  const insert = db.prepare(
    `INSERT INTO coverage_metrics (kind, value, source, run_id) VALUES (?, ?, ?, ?)`
  );
  if (result.functional != null) insert.run('functional', result.functional, dir, req.body?.runId || null);
  if (result.code != null) insert.run('code', result.code, dir, req.body?.runId || null);
  res.json({ ok: true, ...result });
  }
);

app.get(
  '/api/coverage/summary',
  requireProjectPermission('metrics_read', resolveWithDefaultProject),
  (_req, res) => {
  const fn = db
    .prepare(
      `SELECT value FROM coverage_metrics WHERE kind = 'functional' ORDER BY id DESC LIMIT 1`
    )
    .get();
  const cd = db
    .prepare(`SELECT value FROM coverage_metrics WHERE kind = 'code' ORDER BY id DESC LIMIT 1`)
    .get();
  res.json({
    functional: fn ? Number(fn.value) : null,
    code: cd ? Number(cd.value) : null,
  });
  }
);

/** VR coverage scan: greps logs in a directory for VR IDs in uvm_info-like lines */
app.post(
  '/api/vr-coverage/scan-directory',
  requireProjectPermission('regressions_write', resolveWithDefaultProject),
  (req, res) => {
  const dir = String(req.body?.path || '').trim();
  if (!dir) return res.status(400).json({ error: 'path required' });
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: `directory not visible to API: ${dir}` });
  }
  const pid = req.resolvedProjectId;
  const cfg = loadConfig();
  const strict = req.body?.strictUvmInfo !== false;
  const result = scanVrDirectory(dir, { regex: cfg.vrLogRegex, strictUvmInfo: strict });

  const findVr = db.prepare(`SELECT id FROM vrs WHERE public_id = ? AND project_id = ?`);
  const upsert = db.prepare(`
    INSERT INTO vr_coverage (vr_id, hits, source, last_seen_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(vr_id) DO UPDATE SET
      hits = vr_coverage.hits + excluded.hits,
      source = excluded.source,
      last_seen_at = datetime('now')
  `);
  const upsertFile = db.prepare(`
    INSERT INTO vr_coverage_files (vr_id, file_path, test_name)
    VALUES (?, ?, ?)
    ON CONFLICT(vr_id, file_path) DO UPDATE SET
      test_name = excluded.test_name
  `);
  const matched = [];
  const unmatched = [];
  for (const [vrPid, n] of result.hits.entries()) {
    const row = findVr.get(vrPid, pid);
    if (row) {
      upsert.run(row.id, n, dir);
      matched.push({ vr_public_id: vrPid, hits: n });
    } else {
      unmatched.push({ vr_public_id: vrPid, hits: n });
    }
  }
  for (const pf of result.perFileHits || []) {
    const { testRaw, testNormalized } = extractTestNameFromLogPath(pf.path);
    const testLabel = testNormalized || testRaw || null;
    for (const [vrPid] of pf.hits.entries()) {
      const row = findVr.get(vrPid, pid);
      if (row) {
        upsertFile.run(row.id, pf.path, testLabel);
      }
    }
  }
  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES ('VR_COVERAGE', ?, 'SCAN', ?)`
  ).run(dir, JSON.stringify({ matchedCount: matched.length, unmatchedCount: unmatched.length, files: result.files }));
  res.json({ ok: true, files: result.files, matched, unmatched });
  }
);

app.get('/api/vr-coverage', requireProjectPermission('vrs_read', resolveWithDefaultProject), (req, res) => {
  const pid = req.resolvedProjectId;
  const rows = db
    .prepare(
      `
    SELECT v.id AS vr_id, v.public_id AS vr_public_id, c.hits, c.source, c.last_seen_at
    FROM vrs v
    LEFT JOIN vr_coverage c ON c.vr_id = v.id
    WHERE v.project_id = ?
    ORDER BY v.id DESC
  `
    )
    .all(pid);
  const ids = rows.map((r) => r.vr_id);
  const filesByVr = {};
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const fr = db
      .prepare(`SELECT vr_id, file_path, test_name FROM vr_coverage_files WHERE vr_id IN (${ph})`)
      .all(...ids);
    for (const x of fr) {
      if (!filesByVr[x.vr_id]) filesByVr[x.vr_id] = [];
      filesByVr[x.vr_id].push({ path: x.file_path, test: x.test_name });
    }
  }
  res.json(
    rows.map((r) => ({
      vr_public_id: r.vr_public_id,
      hits: r.hits,
      source: r.source,
      last_seen_at: r.last_seen_at,
      log_files: filesByVr[r.vr_id] || [],
    }))
  );
});

app.get('/api/dr-coverage', requireProjectPermission('drs_read', resolveWithDefaultProject), (req, res) => {
  const pid = req.resolvedProjectId;
  const drs = db
    .prepare(
      `SELECT id, public_id FROM drs d
       JOIN spec_versions sv ON sv.id = d.spec_version_id
       JOIN specs s ON s.id = sv.spec_id
       WHERE s.project_id = ?
       ORDER BY d.id DESC`
    )
    .all(pid);
  const linkedVrs = db.prepare(`
    SELECT vr.id AS vr_id, COALESCE(c.hits, 0) AS hits
    FROM vr_dr_links l
    JOIN vrs vr ON vr.id = l.vr_id
    LEFT JOIN vr_coverage c ON c.vr_id = vr.id
    WHERE l.dr_id = ?
  `);
  const out = drs.map((dr) => {
    const links = linkedVrs.all(dr.id);
    const totalLinkedVrs = links.length;
    const coveredVrs = links.filter((l) => l.hits > 0).length;
    const covered = totalLinkedVrs > 0 && coveredVrs === totalLinkedVrs;
    return {
      dr_public_id: dr.public_id,
      total_linked_vrs: totalLinkedVrs,
      covered_vrs: coveredVrs,
      covered,
    };
  });
  res.json(out);
});

/** Scan configurable regression roots (paths); collect sample failure files if present */
app.post(
  '/api/regressions/scan-paths',
  requireProjectPermission('regressions_read', resolveWithDefaultProject),
  (_req, res) => {
  const cfg = loadConfig();
  const roots = cfg.regressionRoots || [];
  const failures = [];
  for (const root of roots) {
    const abs = path.isAbsolute(root) ? root : path.join(path.join(__dirname, '..'), root);
    if (!fs.existsSync(abs)) continue;
    walkFailures(abs, failures, 40);
  }
  const bins = binFailures(failures);
  res.json({ scannedRoots: roots, linesCollected: failures.length, previewBins: bins.slice(0, 10) });
  }
);

function walkFailures(dir, acc, budget) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (acc.length >= budget) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFailures(p, acc, budget);
    else if (/\.(log|txt|out)$/i.test(e.name)) {
      try {
        const txt = fs.readFileSync(p, 'utf8').split('\n').slice(0, 80);
        txt.forEach((line) => {
          if (/FAIL|ERROR|ASSERT|timeout/i.test(line)) acc.push(line.slice(0, 400));
        });
      } catch {
        /* skip */
      }
    }
  }
}

/** --- ISO --- */
app.get(
  '/api/iso/traceability.csv',
  requireProjectPermission('iso_read', resolveWithDefaultProject),
  (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT v.public_id AS vr_id, v.title AS vr_title, v.status AS vr_status, v.asil AS vr_asil,
           v.category AS vr_category,
           d.public_id AS dr_id, d.excerpt AS dr_excerpt, d.stale AS dr_stale, d.category AS dr_category
    FROM vrs v
    LEFT JOIN vr_dr_links l ON v.id = l.vr_id
    LEFT JOIN drs d ON l.dr_id = d.id
    ORDER BY v.id
  `
    )
    .all();
  const header =
    'vr_id,vr_title,vr_status,vr_asil,vr_category,dr_id,dr_excerpt,dr_stale,dr_category\n';
  const body = rows
    .map((r) =>
      [
        r.vr_id,
        csvEscape(r.vr_title),
        r.vr_status,
        r.vr_asil || '',
        r.vr_category || '',
        r.dr_id || '',
        csvEscape((r.dr_excerpt || '').slice(0, 200)),
        r.dr_stale,
        r.dr_category || '',
      ].join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.send(header + body);
  }
);

app.get(
  '/api/iso/audit-log',
  requireProjectPermission('iso_read', resolveWithDefaultProject),
  (_req, res) => {
    const rows = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 500`).all();
    res.json(rows);
  }
);

/** Demo seed */
app.post(
  '/api/demo/seed',
  requireProjectPermission('demo_seed', resolveWithDefaultProject),
  (_req, res) => {
  const lines = [
    'FAIL: uart_timeout waiting for TX empty',
    'FAIL: uart_timeout waiting for TX empty',
    'ERROR sim: assertion failed at tb_pcie.sv:120',
    'panic test timed out after 100us',
  ];
  const bins = binFailures(lines);
  const upsert = db.prepare(`
    INSERT INTO regression_signatures (signature_key, title, category, class, state, total, trend_json)
    VALUES (@signature_key, @title, 'test', 'fail', 'OPEN', @total, @trend_json)
    ON CONFLICT(signature_key) DO UPDATE SET
      total = regression_signatures.total + excluded.total,
      trend_json = excluded.trend_json
  `);
  for (const b of bins) {
    upsert.run({
      signature_key: b.signature_key,
      title: b.title,
      total: b.total,
      trend_json: JSON.stringify([2, 4, 3, b.total]),
    });
    const sig = db
      .prepare(`SELECT id FROM regression_signatures WHERE signature_key = ?`)
      .get(b.signature_key);
    db.prepare(
      `INSERT INTO regression_activity (signature_id, action, reference, state) VALUES (?, ?, ?, ?)`
    ).run(sig.id, 'demo seed', b.sample || '', 'OPEN');
  }
  res.json({ ok: true, bins: bins.length });
  }
);

function csvEscape(s) {
  const t = String(s ?? '').replace(/"/g, '""');
  return `"${t}"`;
}

export { app };

const PORT = Number(process.env.PORT) || 5179;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Hoverboard API http://localhost:${PORT}`);
  });
}
