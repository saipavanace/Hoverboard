import { db } from '../db.js';
import { createArtifactWithFirstVersion, appendArtifactVersion } from './artifactStore.js';
import { markOutgoingLinksSuspect } from './linkGraph.js';

function defaultProjectId() {
  const row = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  return row?.id ?? 1;
}

/**
 * Backfill graph artifacts for legacy DR/VR rows. Idempotent per row.
 */
export function syncLegacyArtifacts() {
  const pid = defaultProjectId();
  const sys = db.prepare(`SELECT id FROM users WHERE email = 'system@hoverboard.internal'`).get();
  const uid = sys?.id ?? null;

  const drs = db.prepare(`SELECT * FROM drs WHERE artifact_id IS NULL`).all();
  for (const dr of drs) {
    const specProj = db
      .prepare(
        `
      SELECT s.project_id FROM spec_versions sv
      JOIN specs s ON s.id = sv.spec_id
      WHERE sv.id = ?
    `
      )
      .get(dr.spec_version_id);
    const projectId = specProj?.project_id ?? pid;

    const tx = db.transaction(() => {
      const content = {
        kind: 'DR',
        public_id: dr.public_id,
        excerpt: dr.excerpt,
        spec_version_id: dr.spec_version_id,
        category: dr.category,
        labels: dr.labels,
        status: dr.status,
        priority: dr.priority,
        description: dr.description,
        comments: dr.comments,
        spec_reference: dr.spec_reference,
        asil: dr.asil,
        stale: dr.stale,
      };
      const { artifact_id } = createArtifactWithFirstVersion(db, {
        project_id: projectId,
        artifact_type: 'DR',
        external_id: dr.public_id,
        title: (dr.excerpt || '').slice(0, 120),
        status: dr.status || 'open',
        asil_level: dr.asil || null,
        content_json: content,
        created_by_user_id: uid,
        legacy_table: 'drs',
        legacy_row_id: dr.id,
      });
      db.prepare(`UPDATE drs SET artifact_id = ?, project_id = ? WHERE id = ?`).run(
        artifact_id,
        projectId,
        dr.id
      );
    });
    tx();
  }

  const vrs = db.prepare(`SELECT * FROM vrs WHERE artifact_id IS NULL`).all();
  for (const vr of vrs) {
    const projectId = vr.project_id || pid;
    const tx = db.transaction(() => {
      const content = {
        kind: 'VR',
        public_id: vr.public_id,
        title: vr.title,
        description: vr.description,
        status: vr.status,
        priority: vr.priority,
        category: vr.category,
        labels: vr.labels,
        asil: vr.asil,
      };
      const { artifact_id } = createArtifactWithFirstVersion(db, {
        project_id: projectId,
        artifact_type: 'VR',
        external_id: vr.public_id,
        title: vr.title,
        status: vr.status || 'draft',
        asil_level: vr.asil || null,
        content_json: content,
        created_by_user_id: uid,
        legacy_table: 'vrs',
        legacy_row_id: vr.id,
      });
      db.prepare(`UPDATE vrs SET artifact_id = ?, project_id = ? WHERE id = ?`).run(
        artifact_id,
        projectId,
        vr.id
      );

      const links = db.prepare(`SELECT dr_id FROM vr_dr_links WHERE vr_id = ?`).all(vr.id);
      const drArt = db.prepare(`SELECT artifact_id FROM drs WHERE id = ?`);
      for (const l of links) {
        const da = drArt.get(l.dr_id);
        if (da?.artifact_id) {
          db.prepare(
            `
            INSERT OR IGNORE INTO artifact_links (source_artifact_id, target_artifact_id, link_type, link_status)
            VALUES (?, ?, 'verifies', 'valid')
          `
          ).run(artifact_id, da.artifact_id);
        }
      }
    });
    tx();
  }
}

/**
 * After VR legacy row is updated in place, append artifact version and mark links suspect.
 */
export function versionVrArtifactFromRow(vrRow, actorUserId) {
  if (!vrRow.artifact_id) return;
  const content = {
    kind: 'VR',
    public_id: vrRow.public_id,
    title: vrRow.title,
    description: vrRow.description,
    status: vrRow.status,
    priority: vrRow.priority,
    category: vrRow.category,
    labels: vrRow.labels,
    asil: vrRow.asil,
  };
  const tx = db.transaction(() => {
    appendArtifactVersion(db, vrRow.artifact_id, content, actorUserId);
    markOutgoingLinksSuspect(vrRow.artifact_id, 'vr_content_updated');
  });
  tx();
}
