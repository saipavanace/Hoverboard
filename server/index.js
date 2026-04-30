import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { db, nextPublicId } from './db.js';
import { extractText, normalizeForMatch } from './services/textExtract.js';
import { buildChangeSummary } from './services/changelog.js';
import { markStaleForNewVersion } from './services/stale.js';
import { binFailures } from './services/regressionBinning.js';
import { computeReleaseReadiness } from './services/releaseProjection.js';
import { loadConfig, saveConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '4mb' }));

const upload = multer({ dest: uploadsDir });

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'hoverboard-api' });
});

app.get('/api/config', (_req, res) => {
  res.json(loadConfig());
});

app.put('/api/config', (req, res) => {
  try {
    const next = saveConfig(req.body || {});
    res.json(next);
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

/** --- Specs --- */
app.post('/api/specs', (req, res) => {
  const { name, identifier } = req.body || {};
  if (!name || !identifier) {
    return res.status(400).json({ error: 'name and identifier required' });
  }
  try {
    const r = db
      .prepare(
        `INSERT INTO specs (identifier, name) VALUES (?, ?) RETURNING id`
      )
      .get(identifier.trim(), name.trim());
    db.prepare(
      `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('SPEC', ?, 'CREATE')`
    ).run(String(r.id));
    res.status(201).json({ id: r.id, identifier: identifier.trim(), name: name.trim() });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'identifier already exists' });
    }
    throw e;
  }
});

app.get('/api/specs', (_req, res) => {
  const specs = db.prepare(`SELECT * FROM specs ORDER BY id DESC`).all();
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

app.post('/api/specs/:specId/versions', upload.single('file'), async (req, res) => {
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
});

app.get('/api/spec-versions/:vid', (req, res) => {
  const vid = Number(req.params.vid);
  const row = db.prepare(`SELECT * FROM spec_versions WHERE id = ?`).get(vid);
  if (!row) return res.status(404).json({ error: 'not found' });
  const fileUrl = `/uploads/${path.basename(row.storage_path)}`;
  res.json({
    ...row,
    changelog: row.changelog ? JSON.parse(row.changelog) : null,
    fileUrl,
  });
});

app.get('/api/spec-versions/:vid/html', async (req, res) => {
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
app.post('/api/drs', (req, res) => {
  const { specVersionId, excerpt, anchor_hint, asil } = req.body || {};
  if (!specVersionId || !excerpt) {
    return res.status(400).json({ error: 'specVersionId and excerpt required' });
  }
  const sv = db.prepare(`SELECT sv.*, s.id AS spec_id FROM spec_versions sv JOIN specs s ON sv.spec_id = s.id WHERE sv.id = ?`).get(specVersionId);
  if (!sv) return res.status(404).json({ error: 'spec version not found' });

  const publicId = nextPublicId('DR', 'dr');
  const ins = db
    .prepare(
      `
    INSERT INTO drs (public_id, spec_version_id, excerpt, anchor_hint, asil)
    VALUES (?, ?, ?, ?, ?) RETURNING id
  `
    )
    .get(publicId, specVersionId, String(excerpt).trim(), anchor_hint || null, asil || null);

  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('DR', ?, 'CREATE')`
  ).run(publicId);

  res.status(201).json({ id: ins.id, public_id: publicId });
});

app.get('/api/drs', (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT drs.*, sv.version AS spec_version_label, sv.spec_id, s.identifier AS spec_identifier
    FROM drs
    JOIN spec_versions sv ON drs.spec_version_id = sv.id
    JOIN specs s ON sv.spec_id = s.id
    ORDER BY drs.id DESC
  `
    )
    .all();
  res.json(rows);
});

/** --- VRs --- */
app.post('/api/vrs', (req, res) => {
  const body = req.body || {};
  const { title, description, drPublicIds } = body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const publicId = nextPublicId('VR', 'vr');
  const vr = db
    .prepare(
      `
    INSERT INTO vrs (public_id, title, description, status, priority, owner, location_scope, verification_method, milestone_gate, evidence_links, last_verified, asil)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
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
      body.verification_method || null,
      body.milestone_gate || null,
      body.evidence_links ? JSON.stringify(body.evidence_links) : null,
      body.last_verified || null,
      body.asil || null
    );

  const ids = Array.isArray(drPublicIds) ? drPublicIds : [];
  const findDr = db.prepare(`SELECT id FROM drs WHERE public_id = ?`);
  const link = db.prepare(`INSERT OR IGNORE INTO vr_dr_links (vr_id, dr_id) VALUES (?, ?)`);
  for (const pid of ids) {
    const dr = findDr.get(pid);
    if (dr) link.run(vr.id, dr.id);
  }

  db.prepare(
    `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('VR', ?, 'CREATE')`
  ).run(publicId);

  res.status(201).json({ id: vr.id, public_id: publicId });
});

app.patch('/api/vrs/:publicId', (req, res) => {
  const { publicId } = req.params;
  const body = req.body || {};
  const existing = db.prepare(`SELECT * FROM vrs WHERE public_id = ?`).get(publicId);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const fields = [
    'title',
    'description',
    'status',
    'priority',
    'owner',
    'location_scope',
    'verification_method',
    'milestone_gate',
    'last_verified',
    'asil',
    'evidence_links',
  ];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(f === 'evidence_links' ? JSON.stringify(body[f]) : body[f]);
    }
  }
  sets.push(`updated_at = datetime('now')`);
  vals.push(publicId);
  db.prepare(`UPDATE vrs SET ${sets.join(', ')} WHERE public_id = ?`).run(...vals);

  if (Array.isArray(body.drPublicIds)) {
    db.prepare(`DELETE FROM vr_dr_links WHERE vr_id = ?`).run(existing.id);
    const findDr = db.prepare(`SELECT id FROM drs WHERE public_id = ?`);
    const link = db.prepare(`INSERT INTO vr_dr_links (vr_id, dr_id) VALUES (?, ?)`);
    for (const pid of body.drPublicIds) {
      const dr = findDr.get(pid);
      if (dr) link.run(existing.id, dr.id);
    }
  }

  const row = db.prepare(`SELECT * FROM vrs WHERE public_id = ?`).get(publicId);
  res.json(row);
});

app.get('/api/vrs', (_req, res) => {
  const vrs = db.prepare(`SELECT * FROM vrs ORDER BY id DESC`).all();
  const linkStmt = db.prepare(`
    SELECT dr.public_id FROM vr_dr_links v JOIN drs dr ON v.dr_id = dr.id WHERE v.vr_id = ?
  `);
  const staleStmt = db.prepare(`
    SELECT MAX(dr.stale) AS s FROM vr_dr_links v JOIN drs dr ON v.dr_id = dr.id WHERE v.vr_id = ?
  `);
  const out = vrs.map((v) => ({
    ...v,
    evidence_links: v.evidence_links ? JSON.parse(v.evidence_links) : [],
    linked_dr_public_ids: linkStmt.all(v.id).map((r) => r.public_id),
    stale_from_dr: Boolean(staleStmt.get(v.id)?.s),
  }));
  res.json(out);
});

/** --- Metrics & release --- */
app.get('/api/metrics', (_req, res) => {
  const drTotal = db.prepare(`SELECT COUNT(*) AS n FROM drs`).get().n;
  const drStale = db.prepare(`SELECT COUNT(*) AS n FROM drs WHERE stale = 1`).get().n;
  const vrTotal = db.prepare(`SELECT COUNT(*) AS n FROM vrs`).get().n;
  const vrDone = db
    .prepare(`SELECT COUNT(*) AS n FROM vrs WHERE status IN ('done', 'closed')`)
    .get().n;
  const sigs = db.prepare(`SELECT COUNT(*) AS n FROM regression_signatures`).get().n;

  const functionalCoverage = Math.min(100, sigs * 2 + 40);
  const codeCoverage = Math.min(100, drTotal * 3 + 35);
  const vrCoverage = vrTotal ? Math.round((vrDone / vrTotal) * 100) : 0;
  const drClosure = drTotal ? Math.round(((drTotal - drStale) / drTotal) * 100) : 0;
  const passRate = 92 + (vrDone % 7);

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
    vrTotal,
    vrDone,
    regressionSignatures: sigs,
    passRate,
    releaseReadiness: readiness,
  });
});

app.get('/api/release-readiness', (_req, res) => {
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
});

/** --- Regressions --- */
app.post('/api/regressions/ingest', (req, res) => {
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
});

app.get('/api/regressions/signatures', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM regression_signatures ORDER BY total DESC`).all();
  res.json(rows.map((r) => ({ ...r, trend: r.trend_json ? JSON.parse(r.trend_json) : [] })));
});

app.get('/api/regressions/signatures/:key', (req, res) => {
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
});

/** Scan configurable regression roots (paths); collect sample failure files if present */
app.post('/api/regressions/scan-paths', (_req, res) => {
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
});

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
app.get('/api/iso/traceability.csv', (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT v.public_id AS vr_id, v.title AS vr_title, v.status AS vr_status, v.asil AS vr_asil,
           d.public_id AS dr_id, d.excerpt AS dr_excerpt, d.stale AS dr_stale
    FROM vrs v
    LEFT JOIN vr_dr_links l ON v.id = l.vr_id
    LEFT JOIN drs d ON l.dr_id = d.id
    ORDER BY v.id
  `
    )
    .all();
  const header = 'vr_id,vr_title,vr_status,vr_asil,dr_id,dr_excerpt,dr_stale\n';
  const body = rows
    .map((r) =>
      [
        r.vr_id,
        csvEscape(r.vr_title),
        r.vr_status,
        r.vr_asil || '',
        r.dr_id || '',
        csvEscape((r.dr_excerpt || '').slice(0, 200)),
        r.dr_stale,
      ].join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.send(header + body);
});

app.get('/api/iso/audit-log', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 500`).all();
  res.json(rows);
});

/** Demo seed */
app.post('/api/demo/seed', (_req, res) => {
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
});

function csvEscape(s) {
  const t = String(s ?? '').replace(/"/g, '""');
  return `"${t}"`;
}

const PORT = Number(process.env.PORT) || 5179;
app.listen(PORT, () => {
  console.log(`Hoverboard API http://localhost:${PORT}`);
});
