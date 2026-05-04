import { db } from '../../db.js';
import { getSpecpilotEnv } from './config.js';
import { generateEmbedding } from './llmProvider.js';
import { cosineSimilarity } from './embeddingService.js';

export function buildFtsQuery(question) {
  const words = String(question || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  const uniq = [...new Set(words || [])].filter((w) => w.length > 1).slice(0, 14);
  if (!uniq.length) return '*';
  return uniq.map((w) => `"${String(w).replace(/"/g, '')}"`).join(' AND ');
}

/** FTS OR over terms — used when AND matches nothing (common for natural-language questions vs spec wording). */
export function buildFtsOrQuery(question) {
  const words = String(question || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  const uniq = [...new Set(words || [])].filter((w) => w.length > 1).slice(0, 14);
  if (!uniq.length) return null;
  return uniq.map((w) => `"${String(w).replace(/"/g, '')}"`).join(' OR ');
}

function countIndexedChunks(projectId, versionFilter) {
  const docClause = versionFilter?.length
    ? `AND d.spec_version_id IN (${versionFilter.map(() => '?').join(',')})`
    : '';
  const params = [projectId, ...(versionFilter || [])];
  const row = db
    .prepare(
      `
    SELECT COUNT(*) AS n
    FROM specpilot_chunks c
    JOIN specpilot_documents d ON d.id = c.document_id
    WHERE d.project_id = ?
      AND d.status = 'ready'
      ${docClause}
  `
    )
    .get(...params);
  return row?.n ?? 0;
}

function scoreBm25Rows(rows) {
  const kwScores = new Map();
  let maxB = 0;
  for (const r of rows) {
    const b = Number(r.b) || 0;
    if (b > maxB) maxB = b;
  }
  for (const r of rows) {
    const b = Number(r.b) || 0;
    const s = maxB > 0 ? 1 - b / (maxB + 1e-6) : 1;
    kwScores.set(r.id, Math.max(0.01, s));
  }
  return kwScores;
}

/**
 * Min-max normalize scores to [0,1]
 */
export function normalizeScores(map) {
  const vals = [...map.values()];
  if (!vals.length) return new Map();
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max === min) {
    return new Map([...map.entries()].map(([k]) => [k, 1]));
  }
  const out = new Map();
  for (const [k, v] of map.entries()) {
    out.set(k, (v - min) / (max - min));
  }
  return out;
}

/**
 * Merge keyword + vector rankings into final chunk order.
 * @param {Map<string, number>} kwScores - higher is better
 * @param {Map<string, number>} vecScores - higher is better
 * @param {number} wVec
 * @param {number} wKw
 */
export function mergeAndRerank(kwScores, vecScores, wVec = 0.55, wKw = 0.45) {
  const ids = new Set([...kwScores.keys(), ...vecScores.keys()]);
  const nKw = normalizeScores(kwScores);
  const nVec = normalizeScores(vecScores);
  /** @type {Array<{ id: string, score: number, reason: string }>} */
  const merged = [];
  for (const id of ids) {
    const k = nKw.get(id) ?? 0;
    const v = nVec.get(id) ?? 0;
    let score;
    let reason;
    if (nVec.size && nKw.size) {
      score = wVec * v + wKw * k;
      reason = `hybrid (vector ${v.toFixed(2)}, keyword ${k.toFixed(2)})`;
    } else if (nVec.size) {
      score = v;
      reason = 'vector similarity';
    } else {
      score = k;
      reason = 'keyword (FTS)';
    }
    merged.push({ id, score, reason });
  }
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

function fetchChunkRows(chunkIds) {
  if (!chunkIds.length) return [];
  const ph = chunkIds.map(() => '?').join(',');
  return db
    .prepare(
      `
    SELECT c.*, d.file_name AS document_file_name, d.display_name AS document_display_name, d.id AS document_id
    FROM specpilot_chunks c
    JOIN specpilot_documents d ON d.id = c.document_id
    WHERE c.id IN (${ph})
  `
    )
    .all(...chunkIds);
}

/**
 * @param {object} opts
 * @param {string} opts.question
 * @param {number} opts.projectId
 * @param {number[]|null} opts.documentIds — spec_version ids to filter; null = all indexed docs in project
 * @param {boolean} opts.includeDRs
 * @param {boolean} opts.includeVRs
 * @param {boolean} opts.includeTests
 * @param {number} [opts.topK]
 */
export async function retrieveForQuestion(opts) {
  const env = getSpecpilotEnv();
  const topK = opts.topK ?? env.topKChunks;

  /** @type {number[]|null} */
  let versionFilter = null;
  if (Array.isArray(opts.documentIds)) {
    versionFilter = opts.documentIds
      .map((x) => Number(x))
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (opts.documentIds.length === 0) {
      return {
        chunks: [],
        indexed_chunk_count: 0,
        retrieval: {
          emptySelection: true,
          fts_query: '',
          keyword_candidates: 0,
          vector_candidates: 0,
          merged_top: [],
          indexed_chunk_count: 0,
          breadth_fallback: false,
        },
        artifacts: { drs: [], vrs: [], tests: [], logs: [] },
      };
    }
  }

  const docClause = versionFilter?.length
    ? `AND d.spec_version_id IN (${versionFilter.map(() => '?').join(',')})`
    : '';
  const baseParams = [opts.projectId, ...(versionFilter || [])];

  const ftsStmt = db.prepare(
    `
    SELECT fts.chunk_id AS id, bm25(specpilot_chunk_fts) AS b
    FROM specpilot_chunk_fts fts
    JOIN specpilot_chunks c ON c.id = fts.chunk_id
    JOIN specpilot_documents d ON d.id = c.document_id
    WHERE specpilot_chunk_fts MATCH ?
      AND d.project_id = ?
      AND d.status = 'ready'
      ${docClause}
    ORDER BY b
    LIMIT 40
  `
  );

  /** @type {Map<string, number>} */
  const kwScores = new Map();
  const ftsQ = buildFtsQuery(opts.question);
  let ftsNote = ftsQ;
  try {
    const kwRows = ftsStmt.all(ftsQ, ...baseParams);
    for (const [id, s] of scoreBm25Rows(kwRows)) kwScores.set(id, s);
  } catch {
    /* FTS AND match failure */
  }

  if (!kwScores.size && ftsQ !== '*') {
    const orQ = buildFtsOrQuery(opts.question);
    if (orQ && orQ.includes(' OR ')) {
      try {
        const orRows = ftsStmt.all(orQ, ...baseParams);
        const orMap = scoreBm25Rows(orRows);
        for (const [id, s] of orMap) kwScores.set(id, s);
        ftsNote = `${ftsQ} (AND) → ${orQ} (OR retry)`;
      } catch {
        /* ignore */
      }
    }
  }

  /** @type {Map<string, number>} */
  const vecScores = new Map();
  let qVec = null;
  try {
    const envE = getSpecpilotEnv();
    if (envE.embeddingKey) {
      qVec = await generateEmbedding(opts.question);
    }
  } catch {
    qVec = null;
  }

  if (qVec) {
    const rows = db
      .prepare(
        `
      SELECT e.chunk_id AS id, e.embedding
      FROM spec_chunk_embeddings e
      JOIN specpilot_chunks c ON c.id = e.chunk_id
      JOIN specpilot_documents d ON d.id = c.document_id
      WHERE d.project_id = ?
        AND d.status = 'ready'
        ${docClause}
    `
      )
      .all(...baseParams);

    for (const r of rows) {
      const buf = r.embedding;
      if (!buf) continue;
      const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const v = Array.from(f32);
      const sim = cosineSimilarity(qVec, v);
      vecScores.set(r.id, sim);
    }
  }

  const merged = mergeAndRerank(kwScores, vecScores, env.hybridVectorWeight, env.hybridKeywordWeight);
  const picked = merged.slice(0, Math.max(topK, 20));
  const chunkIds = picked.map((m) => m.id);

  const chunkRows = fetchChunkRows(chunkIds);
  const byId = Object.fromEntries(chunkRows.map((r) => [r.id, r]));
  let chunks = picked
    .map((m) => {
      const row = byId[m.id];
      if (!row) return null;
      return {
        chunk_id: row.id,
        document_id: row.document_id,
        document_name: row.document_display_name || row.document_file_name,
        section_path: row.section_path,
        heading: row.heading,
        page_start: row.page_start,
        page_end: row.page_end,
        text: row.text,
        similarity_reason: m.reason,
        score: m.score,
      };
    })
    .filter(Boolean)
    .slice(0, topK);

  const indexedChunkCount = countIndexedChunks(opts.projectId, versionFilter);
  let breadthFallback = false;

  if (!chunks.length && indexedChunkCount > 0) {
    const fbRows = db
      .prepare(
        `
      SELECT c.id
      FROM specpilot_chunks c
      JOIN specpilot_documents d ON d.id = c.document_id
      WHERE d.project_id = ?
        AND d.status = 'ready'
        ${docClause}
      ORDER BY d.spec_version_id, c.chunk_index
      LIMIT ?
    `
      )
      .all(...baseParams, topK);
    const fbIds = fbRows.map((r) => r.id);
    const fbFull = fetchChunkRows(fbIds);
    chunks = fbFull.map((row) => ({
      chunk_id: row.id,
      document_id: row.document_id,
      document_name: row.document_display_name || row.document_file_name,
      section_path: row.section_path,
      heading: row.heading,
      page_start: row.page_start,
      page_end: row.page_end,
      text: row.text,
      similarity_reason:
        'breadth fallback (no strong keyword/vector match — showing early chunks from selected indexed specs; try rephrasing your question)',
      score: 0.05,
    }));
    breadthFallback = true;
  }

  const finalChunkIds = chunks.map((c) => c.chunk_id);
  const artifacts = fetchLinkedArtifacts(opts.projectId, finalChunkIds, opts);

  return {
    chunks,
    indexed_chunk_count: indexedChunkCount,
    retrieval: {
      fts_query: ftsNote,
      keyword_candidates: kwScores.size,
      vector_candidates: vecScores.size,
      merged_top: merged.slice(0, 15).map((m) => ({ chunk_id: m.id, score: m.score })),
      indexed_chunk_count: indexedChunkCount,
      breadth_fallback: breadthFallback,
    },
    artifacts,
  };
}

/**
 * @param {number} projectId
 * @param {string[]} chunkIds
 * @param {{ includeDRs: boolean, includeVRs: boolean, includeTests: boolean }} flags
 */
export function fetchLinkedArtifacts(projectId, chunkIds, flags) {
  const out = { drs: [], vrs: [], tests: [], logs: [] };
  if (!chunkIds.length) return out;

  const ph = chunkIds.map(() => '?').join(',');
  const links = db
    .prepare(
      `
    SELECT * FROM spec_artifact_links
    WHERE project_id = ? AND source_type = 'spec_chunk' AND source_id IN (${ph})
  `
    )
    .all(projectId, ...chunkIds);

  const drIds = new Set();
  const vrIds = new Set();

  for (const L of links) {
    if (L.target_type === 'DR' && flags.includeDRs) drIds.add(L.target_id);
    if (L.target_type === 'VR' && flags.includeVRs) vrIds.add(L.target_id);
    if (L.target_type === 'TEST' && flags.includeTests) {
      out.tests.push({
        name: L.target_id,
        proves: L.link_type,
        latestResult: 'unknown',
        evidence: L.metadata_json || '',
      });
    }
  }

  if (flags.includeDRs && drIds.size) {
    const phd = [...drIds].map(() => '?').join(',');
    const rows = db
      .prepare(
        `
      SELECT dr.public_id, dr.excerpt, dr.status, dr.spec_reference
      FROM drs dr
      JOIN spec_versions sv ON sv.id = dr.spec_version_id
      JOIN specs s ON s.id = sv.spec_id
      WHERE s.project_id = ? AND dr.public_id IN (${phd})
    `
      )
      .all(projectId, ...drIds);

    for (const dr of rows) {
      out.drs.push({
        id: dr.public_id,
        title: dr.excerpt?.slice(0, 200) || dr.public_id,
        status: 'linked',
        impactReason: 'Linked from SpecPilot artifact link',
        excerpt: dr.excerpt,
        spec_reference: dr.spec_reference,
      });
    }
  }

  if (flags.includeVRs && vrIds.size) {
    const phv = [...vrIds].map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT public_id, title, description, status FROM vrs WHERE project_id = ? AND public_id IN (${phv})`
      )
      .all(projectId, ...vrIds);
    for (const v of rows) {
      out.vrs.push({
        id: v.public_id,
        title: v.title,
        linkedDR: '',
        coverageStatus: 'unknown',
        reason: v.description?.slice(0, 200) || '',
        status: v.status,
      });
    }
  }

  // Enrich VR ↔ DR for linked VRs
  if (flags.includeVRs && out.vrs.length) {
    const vrStmt = db.prepare(`
      SELECT v.public_id AS vr_id, dr.public_id AS dr_id
      FROM vrs v
      JOIN vr_dr_links j ON j.vr_id = v.id
      JOIN drs dr ON dr.id = j.dr_id
      WHERE v.project_id = ? AND v.public_id = ?
    `);
    for (const vr of out.vrs) {
      const r = vrStmt.get(projectId, vr.id);
      if (r) vr.linkedDR = r.dr_id;
    }
  }

  return out;
}
