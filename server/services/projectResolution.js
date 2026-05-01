import { db } from '../db.js';

export function projectIdFromSpec(specId) {
  const row = db.prepare(`SELECT project_id FROM specs WHERE id = ?`).get(specId);
  return row?.project_id ?? null;
}

export function projectIdFromSpecVersion(specVersionId) {
  const row = db
    .prepare(
      `
    SELECT s.project_id FROM spec_versions sv JOIN specs s ON s.id = sv.spec_id WHERE sv.id = ?
  `
    )
    .get(specVersionId);
  return row?.project_id ?? null;
}

export function projectIdFromDr(drId) {
  const row = db
    .prepare(
      `
    SELECT s.project_id FROM drs d
    JOIN spec_versions sv ON sv.id = d.spec_version_id
    JOIN specs s ON s.id = sv.spec_id
    WHERE d.id = ?
  `
    )
    .get(drId);
  return row?.project_id ?? null;
}

export function projectIdFromVr(vrId) {
  const row = db.prepare(`SELECT project_id FROM vrs WHERE id = ?`).get(vrId);
  return row?.project_id ?? null;
}

export function projectIdFromArtifact(artifactId) {
  const row = db.prepare(`SELECT project_id FROM artifacts WHERE id = ?`).get(artifactId);
  return row?.project_id ?? null;
}
