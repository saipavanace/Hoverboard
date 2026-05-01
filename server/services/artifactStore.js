import crypto from 'crypto';
import { db } from '../db.js';

export function sha256Json(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function createArtifactWithFirstVersion(tx, row) {
  const {
    project_id,
    artifact_type,
    external_id,
    title,
    status,
    asil_level,
    content_json,
    created_by_user_id,
    legacy_table,
    legacy_row_id,
  } = row;

  const content_hash = sha256Json(content_json);
  const art = tx
    .prepare(
      `
    INSERT INTO artifacts (
      project_id, artifact_type, external_id, title, status, asil_level,
      current_version_id, legacy_table, legacy_row_id, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    RETURNING id
  `
    )
    .get(
      project_id,
      artifact_type,
      external_id,
      title || '',
      status || 'draft',
      asil_level || null,
      legacy_table || null,
      legacy_row_id ?? null,
      created_by_user_id ?? null
    );

  const ver = tx
    .prepare(
      `
    INSERT INTO artifact_versions (artifact_id, version_number, content_json, content_hash, created_by_user_id)
    VALUES (?, 1, ?, ?, ?)
    RETURNING id
  `
    )
    .get(art.id, typeof content_json === 'string' ? content_json : JSON.stringify(content_json), content_hash, created_by_user_id ?? null);

  tx.prepare(`UPDATE artifacts SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
    ver.id,
    art.id
  );

  return { artifact_id: art.id, version_id: ver.id };
}

export function appendArtifactVersion(tx, artifactId, content_json, created_by_user_id) {
  const maxRow = tx.prepare(`SELECT MAX(version_number) AS m FROM artifact_versions WHERE artifact_id = ?`).get(artifactId);
  const nextNum = (maxRow?.m || 0) + 1;
  const content_hash = sha256Json(content_json);
  const ver = tx
    .prepare(
      `
    INSERT INTO artifact_versions (artifact_id, version_number, content_json, content_hash, created_by_user_id)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `
    )
    .get(
      artifactId,
      nextNum,
      typeof content_json === 'string' ? content_json : JSON.stringify(content_json),
      content_hash,
      created_by_user_id ?? null
    );
  tx.prepare(`UPDATE artifacts SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
    ver.id,
    artifactId
  );
  return ver.id;
}

export function getArtifactByLegacy(table, rowId) {
  return db.prepare(`SELECT * FROM artifacts WHERE legacy_table = ? AND legacy_row_id = ?`).get(table, rowId);
}

export function getArtifactByExternal(projectId, artifactType, externalId) {
  return db
    .prepare(
      `SELECT * FROM artifacts WHERE project_id = ? AND artifact_type = ? AND external_id = ?`
    )
    .get(projectId, artifactType, externalId);
}
