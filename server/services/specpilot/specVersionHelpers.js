import { db } from '../../db.js';

export function defaultSpecVersionIdForProject(projectId) {
  const row = db
    .prepare(
      `
    SELECT sv.id FROM spec_versions sv
    JOIN specs s ON s.id = sv.spec_id
    WHERE s.project_id = ?
    ORDER BY datetime(COALESCE(sv.uploaded_at, '')) DESC, sv.id DESC
    LIMIT 1
  `
    )
    .get(projectId);
  return row?.id ?? null;
}
