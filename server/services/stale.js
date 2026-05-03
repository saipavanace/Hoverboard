import { normalizeForMatch } from './textExtract.js';

/**
 * Mark DRs stale when their excerpt no longer appears in the latest spec text for the same logical spec.
 */
export function markStaleForNewVersion(db, specId, newExtractedText) {
  const normNew = normalizeForMatch(newExtractedText);
  const drs = db
    .prepare(
      `
    SELECT drs.id, drs.public_id, drs.excerpt, drs.stale
    FROM drs
    JOIN spec_versions sv ON drs.spec_version_id = sv.id
    WHERE sv.spec_id = ?
  `
    )
    .all(specId);

  const update = db.prepare(
    `UPDATE drs SET stale = ?, stale_reason = ? WHERE id = ?`
  );
  const linkVr = db.prepare(`
    UPDATE vrs SET updated_at = datetime('now')
    WHERE id IN (
      SELECT vr_id FROM vr_dr_links WHERE dr_id = ?
    )
  `);

  let marked = 0;
  /** @type {string[]} */
  const drPublicIds = [];
  for (const dr of drs) {
    const ex = normalizeForMatch(dr.excerpt);
    const stillThere = ex.length > 0 && normNew.includes(ex);
    if (!stillThere) {
      update.run(
        1,
        'Spec text changed; DR excerpt no longer found in latest version.',
        dr.id
      );
      linkVr.run(dr.id);
      marked++;
      drPublicIds.push(dr.public_id);
      db.prepare(
        `INSERT INTO audit_log (entity_type, entity_id, action, detail) VALUES ('DR', ?, 'STALE', ?)`
      ).run(dr.public_id, 'Marked stale after spec upload');
    }
  }
  return { marked, drPublicIds };
}
