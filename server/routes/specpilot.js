import { Router } from 'express';
import crypto from 'crypto';
import { db, nextPublicId } from '../db.js';
import { requireProjectPermission } from '../middleware/permissions.js';
import { resolveWithDefaultProject } from '../middleware/permissions.js';
import { loadConfig } from '../config.js';
import { appendAuditEvent } from '../services/auditEvents.js';
import { createArtifactWithFirstVersion } from '../services/artifactStore.js';
import { validateRequirementCategory, flattenAllowedCategoryValues } from '../services/requirementCategories.js';
import { normalizeVrKind, kindToIdParts } from '../services/vrKind.js';
import { ingestSpecVersion } from '../services/specpilot/ingestionService.js';
import { retrieveForQuestion } from '../services/specpilot/retrievalService.js';
import { generateAnswer, answerCacheKey } from '../services/specpilot/answerService.js';
import { defaultSpecVersionIdForProject } from '../services/specpilot/specVersionHelpers.js';

const router = Router();

function normalizeLabelInput(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

router.get(
  '/specpilot/spec-versions',
  requireProjectPermission('specs_read', resolveWithDefaultProject),
  (req, res) => {
    const projectId = req.resolvedProjectId;
    const rows = db
      .prepare(
        `
      SELECT sv.id AS spec_version_id,
        sv.version AS version_label,
        sv.original_filename,
        sv.uploaded_at,
        s.id AS spec_id,
        s.name AS spec_name,
        s.identifier AS spec_identifier,
        d.id AS specpilot_document_id,
        d.status,
        d.status_message,
        (SELECT COUNT(*) FROM specpilot_chunks c WHERE c.document_id = d.id) AS chunk_count
      FROM spec_versions sv
      JOIN specs s ON s.id = sv.spec_id
      LEFT JOIN specpilot_documents d ON d.spec_version_id = sv.id
      WHERE s.project_id = ?
      ORDER BY s.name COLLATE NOCASE ASC, sv.id DESC
    `
      )
      .all(projectId);
    res.json(rows);
  }
);

router.post(
  '/specpilot/spec-versions/:vid/reindex',
  requireProjectPermission('specs_write', resolveWithDefaultProject),
  (req, res) => {
    const vid = Number(req.params.vid);
    if (!Number.isFinite(vid) || vid <= 0) return res.status(400).json({ error: 'invalid spec version id' });

    const projectId = req.resolvedProjectId;
    const ok = db
      .prepare(
        `
      SELECT 1 AS ok FROM spec_versions sv
      JOIN specs s ON s.id = sv.spec_id
      WHERE sv.id = ? AND s.project_id = ?
    `
      )
      .get(vid, projectId);
    if (!ok) return res.status(404).json({ error: 'spec version not found' });

    res.status(202).json({ accepted: true, spec_version_id: vid });
    ingestSpecVersion(projectId, vid).catch((err) => {
      console.error('[specpilot] reindex failed', err);
    });
  }
);

router.get(
  '/specpilot/chunks/:chunkId',
  requireProjectPermission('specs_read', resolveWithDefaultProject),
  (req, res) => {
    const projectId = req.resolvedProjectId;
    const row = db
      .prepare(
        `
      SELECT c.*, d.display_name AS document_display_name, d.file_name
      FROM specpilot_chunks c
      JOIN specpilot_documents d ON d.id = c.document_id
      WHERE c.id = ? AND d.project_id = ?
    `
      )
      .get(req.params.chunkId, projectId);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  }
);

router.post(
  '/specpilot/ask',
  requireProjectPermission('specs_read', resolveWithDefaultProject),
  async (req, res) => {
    const projectId = req.resolvedProjectId;
    const body = req.body || {};
    const question = String(body.question || '').trim();
    if (!question) return res.status(400).json({ error: 'question required' });

    const documentIds = Array.isArray(body.documentIds) ? body.documentIds.filter(Boolean) : null;
    const includeDRs = body.includeDRs !== false;
    const includeVRs = body.includeVRs !== false;
    const includeTests = body.includeTests !== false;
    const strictCitationsOnly = body.strictCitationsOnly === true;

    const cacheHash = answerCacheKey(question, documentIds, {
      includeDRs,
      includeVRs,
      includeTests,
      strictCitationsOnly,
      projectId,
    });

    const cached = db
      .prepare(
        `
      SELECT a.answer_json FROM specpilot_answers a
      JOIN specpilot_questions q ON q.id = a.question_id
      WHERE q.project_id = ? AND q.question_text = ? AND q.selected_document_ids_json = ?
      ORDER BY datetime(a.created_at) DESC LIMIT 1
    `
      )
      .get(projectId, question, JSON.stringify(documentIds || []));

    if (cached?.answer_json) {
      try {
        const parsed = JSON.parse(cached.answer_json);
        return res.json({
          answer: parsed,
          cached: true,
          retrieval: { cacheHit: true, cacheKey: cacheHash },
        });
      } catch {
        /* continue */
      }
    }

    let retrieval;
    try {
      retrieval = await retrieveForQuestion({
        question,
        projectId,
        documentIds,
        includeDRs,
        includeVRs,
        includeTests,
      });
    } catch (e) {
      return res.status(500).json({ error: String(e?.message || e) });
    }

    const mergedArtifacts = {
      drs: retrieval.artifacts.drs,
      vrs: retrieval.artifacts.vrs,
      tests: retrieval.artifacts.tests,
    };

    const gen = await generateAnswer({
      question,
      chunks: retrieval.chunks,
      artifacts: mergedArtifacts,
      strictCitationsOnly,
      retrievalMeta: {
        ...retrieval.retrieval,
        indexed_chunk_count:
          retrieval.indexed_chunk_count ?? retrieval.retrieval?.indexed_chunk_count ?? 0,
      },
    });

    const qid = crypto.randomUUID();
    const aid = crypto.randomUUID();
    const actorId = req.authUser?.id ?? null;

    db.prepare(
      `
      INSERT INTO specpilot_questions (id, project_id, question_text, selected_document_ids_json, created_by, answer_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(qid, projectId, question, JSON.stringify(documentIds || []), actorId, gen.answer.status);

    db.prepare(
      `
      INSERT INTO specpilot_answers (id, question_id, answer_json, model_name, retrieval_metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(
      aid,
      qid,
      JSON.stringify(gen.answer),
      gen.model,
      JSON.stringify({ ...retrieval.retrieval, chunks_used: retrieval.chunks?.length || 0 })
    );

    res.json({
      answer: gen.answer,
      cached: false,
      retrieval: retrieval.retrieval,
      questionId: qid,
      answerId: aid,
    });
  }
);

router.post(
  '/specpilot/actions/create-dr',
  requireProjectPermission('drs_write', resolveWithDefaultProject),
  (req, res) => {
    const projectId = req.resolvedProjectId;
    const body = req.body || {};
    const excerpt = String(body.excerpt || body.title || '').trim();
    if (!excerpt) return res.status(400).json({ error: 'excerpt or title required' });

    const cfg = loadConfig();
    const allowedCats = flattenAllowedCategoryValues(cfg.requirementCategories || []);
    let finalCategory = String(body.category || '').trim();
    if (!finalCategory && allowedCats.length) finalCategory = allowedCats[0];
    if (!finalCategory) finalCategory = 'general';
    const catErr = validateRequirementCategory(finalCategory, cfg);
    if (catErr) return res.status(400).json({ error: catErr });

    let specVersionId = body.specVersionId ? Number(body.specVersionId) : defaultSpecVersionIdForProject(projectId);
    if (!specVersionId) {
      return res.status(400).json({
        error:
          'No spec version found for this project. Upload a spec version under Specs first, or pass specVersionId.',
      });
    }

    const sv = db
      .prepare(
        `SELECT sv.*, s.name AS spec_name, s.identifier AS spec_identifier FROM spec_versions sv JOIN specs s ON s.id = sv.spec_id WHERE sv.id = ? AND s.project_id = ?`
      )
      .get(specVersionId, projectId);
    if (!sv) return res.status(404).json({ error: 'spec version not found for project' });

    const specReference =
      body.spec_reference?.trim() || `${sv.spec_name} · v${sv.version} · ${sv.spec_identifier}`;
    const publicId = nextPublicId('DR', 'dr');
    const labelsJson = JSON.stringify(normalizeLabelInput(body.labels));
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
        excerpt,
        body.anchor_hint || null,
        body.asil || null,
        finalCategory,
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
      excerpt: excerpt.slice(0, 2000),
      spec_version_id: specVersionId,
      category: finalCategory,
      labels: normalizeLabelInput(body.labels),
      status: body.status || 'open',
      asil: body.asil || null,
      spec_reference: specReference,
      stale: 0,
    };
    const graph = createArtifactWithFirstVersion(db, {
      project_id: projectId,
      artifact_type: 'DR',
      external_id: publicId,
      title: excerpt.slice(0, 120),
      status: body.status || 'open',
      content_json: content,
      created_by_user_id: actorId,
      legacy_table: 'drs',
      legacy_row_id: ins.id,
    });
    db.prepare(`UPDATE drs SET artifact_id = ? WHERE id = ?`).run(graph.artifact_id, ins.id);

    const chunkId = body.chunkId || body.sourceChunkId;
    if (chunkId) {
      const lid = crypto.randomUUID();
      db.prepare(
        `
        INSERT INTO spec_artifact_links (id, project_id, source_type, source_id, target_type, target_id, link_type, confidence, created_by, metadata_json)
        VALUES (?, ?, 'spec_chunk', ?, 'DR', ?, 'derives_from', 1, ?, ?)
      `
      ).run(lid, projectId, chunkId, publicId, actorId, JSON.stringify({ from: 'specpilot_create_dr' }));
    }

    db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('DR', ?, 'CREATE')`).run(publicId);

    appendAuditEvent({
      actorUserId: actorId,
      action: 'SPECPILOT_CREATE_DR',
      entityType: 'DR',
      entityId: publicId,
      detail: { chunk_id: chunkId || null },
      mirrorLegacy: true,
    });

    res.status(201).json({ public_id: publicId, id: ins.id });
  }
);

router.post(
  '/specpilot/actions/create-vr',
  requireProjectPermission('vrs_write', resolveWithDefaultProject),
  (req, res) => {
    const projectId = req.resolvedProjectId;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });

    const cfg = loadConfig();
    const allowedCats = flattenAllowedCategoryValues(cfg.requirementCategories || []);
    let category = String(body.category || '').trim();
    if (!category && allowedCats.length) category = allowedCats[0];
    if (!category) category = 'general';
    const catErr = validateRequirementCategory(category, cfg);
    if (catErr) return res.status(400).json({ error: catErr });

    const ids = Array.isArray(body.drPublicIds) ? body.drPublicIds : [];
    const findDr = db.prepare(`SELECT id FROM drs WHERE public_id = ?`);
    const resolvedIds = [];
    for (const pid of ids) {
      const dr = findDr.get(pid);
      if (dr) resolvedIds.push(dr.id);
    }
    if (!resolvedIds.length) {
      return res.status(400).json({ error: 'At least one valid drPublicIds entry required' });
    }

    const rawKind = body.kind ?? body.vr_kind;
    let vrKind = 'VR';
    if (rawKind !== undefined && rawKind !== null && String(rawKind).trim() !== '') {
      vrKind = normalizeVrKind(rawKind);
      if (!vrKind) return res.status(400).json({ error: 'kind must be one of: VR, SR, CR, AR' });
    }

    const { prefix, counterKey } = kindToIdParts(vrKind);
    const publicId = nextPublicId(prefix, counterKey);
    const labelsJson = JSON.stringify(normalizeLabelInput(body.labels));
    const actorId = req.authUser?.id ?? null;

    const vr = db
      .prepare(
        `
      INSERT INTO vrs (public_id, vr_kind, title, description, status, priority, owner, location_scope, evidence_links, last_verified, asil, category, labels, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `
      )
      .get(
        publicId,
        vrKind,
        title,
        body.description || '',
        body.status || 'draft',
        body.priority || null,
        body.owner || null,
        body.location_scope || null,
        body.evidence_links ? JSON.stringify(body.evidence_links) : null,
        body.last_verified || null,
        body.asil || null,
        category,
        labelsJson,
        projectId
      );

    const link = db.prepare(`INSERT INTO vr_dr_links (vr_id, dr_id) VALUES (?, ?)`);
    for (const drId of resolvedIds) {
      link.run(vr.id, drId);
    }

    const content = {
      kind: 'VR',
      vr_kind: vrKind,
      public_id: publicId,
      title: title.trim(),
      description: body.description || '',
      status: body.status || 'draft',
      category,
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
    const insertArtLink = db.prepare(
      `INSERT INTO artifact_links (source_artifact_id, target_artifact_id, link_type, link_status) VALUES (?, ?, 'verifies', 'valid')`
    );
    for (const drId of resolvedIds) {
      const da = drArtStmt.get(drId);
      if (da?.artifact_id) {
        insertArtLink.run(graph.artifact_id, da.artifact_id);
      }
    }

    db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('VR', ?, 'CREATE')`).run(publicId);

    const chunkId = body.chunkId || body.sourceChunkId;
    if (chunkId) {
      const lid = crypto.randomUUID();
      db.prepare(
        `
        INSERT INTO spec_artifact_links (id, project_id, source_type, source_id, target_type, target_id, link_type, confidence, created_by, metadata_json)
        VALUES (?, ?, 'spec_chunk', ?, 'VR', ?, 'verifies', 1, ?, ?)
      `
      ).run(lid, projectId, chunkId, publicId, actorId, JSON.stringify({ from: 'specpilot_create_vr' }));
    }

    appendAuditEvent({
      actorUserId: actorId,
      action: 'SPECPILOT_CREATE_VR',
      entityType: 'VR',
      entityId: publicId,
      detail: { chunk_id: chunkId || null },
      mirrorLegacy: true,
    });

    res.status(201).json({ public_id: publicId, id: vr.id });
  }
);

router.post(
  '/specpilot/actions/link-existing-artifact',
  requireProjectPermission('specs_write', resolveWithDefaultProject),
  (req, res) => {
    const projectId = req.resolvedProjectId;
    const body = req.body || {};
    const sourceType = String(body.sourceType || 'spec_chunk');
    const sourceId = String(body.sourceId || '').trim();
    const targetType = String(body.targetType || '').trim();
    const targetId = String(body.targetId || '').trim();
    const linkType = String(body.linkType || 'related_to').trim();
    if (!sourceId || !targetType || !targetId) {
      return res.status(400).json({ error: 'sourceId, targetType, targetId required' });
    }

    const lid = crypto.randomUUID();
    const actorId = req.authUser?.id ?? null;
    db.prepare(
      `
      INSERT INTO spec_artifact_links (id, project_id, source_type, source_id, target_type, target_id, link_type, confidence, created_by, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      lid,
      projectId,
      sourceType,
      sourceId,
      targetType,
      targetId,
      linkType,
      body.confidence != null ? Number(body.confidence) : null,
      actorId,
      body.metadata ? JSON.stringify(body.metadata) : null
    );

    res.status(201).json({ id: lid });
  }
);

export default router;
