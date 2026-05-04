import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../../db.js';
import { extractSpecText, extractPdfWithPageEstimates } from './specTextExtract.js';
import { parseIntoSections, chunkSections, estimateTokens } from './chunkingService.js';
import { embedChunkIds } from './embeddingService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getUploadsDir() {
  return process.env.HOVERBOARD_UPLOADS_DIR && String(process.env.HOVERBOARD_UPLOADS_DIR).trim() !== ''
    ? path.resolve(process.env.HOVERBOARD_UPLOADS_DIR)
    : path.join(__dirname, '..', '..', 'uploads');
}

function hashText(t) {
  return crypto.createHash('sha256').update(t || '', 'utf8').digest('hex');
}

export function extFromFilename(name) {
  const e = path.extname(name || '').toLowerCase().replace('.', '');
  return e || 'txt';
}

/**
 * Ingest from a spec version created in the Specs tab.
 * @param {number} projectId
 * @param {number} specVersionId
 */
export async function ingestSpecVersion(projectId, specVersionId) {
  const row = db
    .prepare(
      `
    SELECT sv.*, s.name AS spec_name, s.project_id
    FROM spec_versions sv
    JOIN specs s ON s.id = sv.spec_id
    WHERE sv.id = ?
  `
    )
    .get(specVersionId);
  if (!row || row.project_id !== projectId) {
    throw new Error('Spec version not found for this project');
  }

  const uploadsDir = getUploadsDir();
  const base = row.storage_path ? path.basename(row.storage_path) : '';
  const filePath = base ? path.join(uploadsDir, base) : null;
  const fileType = extFromFilename(row.original_filename || '');
  const displayName = `${row.spec_name} · v${row.version}`;

  let docRow = db.prepare(`SELECT id FROM specpilot_documents WHERE spec_version_id = ?`).get(specVersionId);
  const docId = docRow?.id ?? crypto.randomUUID();
  const pathForDb = filePath || '';
  const size = filePath && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

  if (!docRow) {
    db.prepare(
      `
      INSERT INTO specpilot_documents
        (id, project_id, spec_version_id, file_name, display_name, file_type, file_size, storage_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')
    `
    ).run(
      docId,
      projectId,
      specVersionId,
      row.original_filename || 'spec',
      displayName,
      fileType,
      size,
      pathForDb
    );
  } else {
    db.prepare(
      `
      UPDATE specpilot_documents
      SET display_name = ?, file_name = ?, file_type = ?, file_size = ?, storage_path = ?, updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(
      displayName,
      row.original_filename || 'spec',
      fileType,
      size,
      pathForDb,
      docId
    );
  }

  await ingestDocumentFromPath({
    docId,
    projectId,
    filePath: filePath && fs.existsSync(filePath) ? filePath : null,
    fileName: row.original_filename || 'spec',
    displayName,
    fileType,
    rawTextFallback: row.extracted_text || '',
  });
}

async function extractRawContent({ filePath, fileType, fileName, rawTextFallback }) {
  if (filePath && fs.existsSync(filePath)) {
    if (fileType === 'pdf') {
      const pdf = await extractPdfWithPageEstimates(filePath);
      return { rawText: pdf.text, totalPages: pdf.numpages };
    }
    const rawText = await extractSpecText(filePath, fileType, fileName);
    return { rawText, totalPages: null };
  }
  const fb = String(rawTextFallback || '').trim();
  if (fb) {
    return { rawText: fb, totalPages: null };
  }
  throw new Error(
    'Spec file is missing on disk and no extracted text is stored. Re-upload this version from the Specs tab.'
  );
}

/**
 * Run full pipeline for a document record.
 * @param {object} p
 * @param {string} p.docId
 * @param {number} p.projectId
 * @param {string|null} p.filePath
 * @param {string} p.fileName
 * @param {string} p.displayName
 * @param {string} p.fileType
 * @param {string} [p.rawTextFallback] — used when filePath is missing (e.g. from spec_versions.extracted_text)
 */
export async function ingestDocumentFromPath(p) {
  const { docId, filePath, fileName, displayName, fileType, rawTextFallback } = p;

  const upd = db.prepare(`
    UPDATE specpilot_documents SET status = ?, updated_at = datetime('now'), status_message = NULL WHERE id = ?
  `);

  try {
    upd.run('extracting', docId);

    const { rawText, totalPages } = await extractRawContent({
      filePath,
      fileType,
      fileName,
      rawTextFallback,
    });

    const contentHash = hashText(rawText);

    db.prepare(
      `UPDATE specpilot_documents SET raw_text = ?, content_hash = ?, metadata_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      rawText,
      contentHash,
      JSON.stringify({ extractedAt: new Date().toISOString(), approxPages: totalPages }),
      docId
    );

    upd.run('chunking', docId);

    db.prepare(`DELETE FROM specpilot_chunks WHERE document_id = ?`).run(docId);

    const sections = parseIntoSections(rawText, { totalPages: totalPages || undefined });
    const display = displayName || fileName;
    const rows = chunkSections(display, sections);

    const ins = db.prepare(`
      INSERT INTO specpilot_chunks
        (id, document_id, section_path, heading, chunk_index, text, page_start, page_end, token_count, content_hash, is_table, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const chunkIds = [];
    for (const r of rows) {
      const id = crypto.randomUUID();
      const cHash = hashText(r.text);
      ins.run(
        id,
        docId,
        r.section_path,
        r.heading,
        r.chunk_index,
        r.text,
        r.page_start,
        r.page_end,
        r.token_count || estimateTokens(r.text),
        cHash,
        r.is_table,
        r.metadata_json
      );
      chunkIds.push(id);
    }

    db.prepare(
      `UPDATE specpilot_documents SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run('embedding', docId);

    await embedChunkIds(chunkIds);

    db.prepare(
      `UPDATE specpilot_documents SET status = ?, status_message = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run('ready', docId);
  } catch (e) {
    const msg = String(e?.message || e);
    db.prepare(
      `UPDATE specpilot_documents SET status = ?, status_message = ?, updated_at = datetime('now') WHERE id = ?`
    ).run('failed', msg.slice(0, 2000), docId);
    throw e;
  }
}
