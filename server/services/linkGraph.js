import { db } from '../db.js';

/** When source artifact changes version, mark outgoing links as suspect (downstream traceability). */
export function markOutgoingLinksSuspect(sourceArtifactId, reason = 'upstream_changed') {
  db.prepare(
    `
    UPDATE artifact_links SET link_status = 'suspect', suspect_reason = ?
    WHERE source_artifact_id = ? AND link_status = 'valid'
  `
  ).run(reason, sourceArtifactId);
}

/** Mark incoming links when target changed — configurable policy: here we mark links TO this artifact from dependents */
export function markIncomingLinksSuspect(targetArtifactId, reason = 'artifact_changed') {
  db.prepare(
    `
    UPDATE artifact_links SET link_status = 'suspect', suspect_reason = ?
    WHERE target_artifact_id = ? AND link_status = 'valid'
  `
  ).run(reason, targetArtifactId);
}
