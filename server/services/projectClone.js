import fs from 'fs';
import path from 'path';
import { db, nextPublicId } from '../db.js';
import { kindToIdParts } from './vrKind.js';

/**
 * Deep-copy specs (with uploaded files), DRs, VRs, links, and VR coverage from source → target project.
 * Artifact rows are filled by syncLegacyArtifacts() after import.
 */
export function cloneProjectContent(sourceProjectId, targetProjectId, uploadsDir) {
  const srcPid = Number(sourceProjectId);
  const dstPid = Number(targetProjectId);
  if (!Number.isFinite(srcPid) || !Number.isFinite(dstPid) || srcPid === dstPid) {
    throw new Error('invalid clone parameters');
  }

  const srcExists = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(srcPid);
  const dstExists = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(dstPid);
  if (!srcExists || !dstExists) throw new Error('project not found');

  const specMap = {};
  const svMap = {};
  const drMap = {};
  const vrMap = {};

  const specs = db
    .prepare(`SELECT * FROM specs WHERE project_id = ? ORDER BY id`)
    .all(srcPid);

  const tx = db.transaction(() => {
    const suffix = `${dstPid}-${Date.now().toString(36)}`;

    for (const spec of specs) {
      const newIdentifier = `${spec.identifier}-copy-${suffix}`;
      const ins = db
        .prepare(
          `INSERT INTO specs (identifier, name, description, folder_path, project_id, latest_version_id)
           VALUES (?, ?, ?, ?, ?, NULL)
           RETURNING id`
        )
        .get(
          newIdentifier,
          spec.name,
          spec.description ?? null,
          spec.folder_path ?? null,
          dstPid
        );
      specMap[spec.id] = ins.id;
    }

    const versions = db
      .prepare(
        `
      SELECT sv.* FROM spec_versions sv
      JOIN specs s ON sv.spec_id = s.id
      WHERE s.project_id = ?
      ORDER BY sv.id
    `
      )
      .all(srcPid);

    for (const sv of versions) {
      const newSpecId = specMap[sv.spec_id];
      if (!newSpecId) continue;

      let newStorage = sv.storage_path;
      if (sv.storage_path) {
        const base = path.basename(sv.storage_path);
        const srcPath = path.join(uploadsDir, base);
        const destName = `${newSpecId}_${sv.version}_${Date.now()}_${base}`;
        const destPath = path.join(uploadsDir, destName);
        try {
          if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            newStorage = destName;
          }
        } catch {
          newStorage = sv.storage_path;
        }
      }

      const vrIns = db
        .prepare(
          `
        INSERT INTO spec_versions (spec_id, version, original_filename, mime_type, storage_path, extracted_text, changelog)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `
        )
        .get(
          newSpecId,
          sv.version,
          sv.original_filename,
          sv.mime_type,
          newStorage,
          sv.extracted_text,
          sv.changelog
        );
      svMap[sv.id] = vrIns.id;
    }

    for (const spec of specs) {
      const newSpecId = specMap[spec.id];
      const oldLatest = spec.latest_version_id;
      if (oldLatest && svMap[oldLatest]) {
        db.prepare(`UPDATE specs SET latest_version_id = ? WHERE id = ?`).run(svMap[oldLatest], newSpecId);
      }
    }

    const drRows = db
      .prepare(
        `
      SELECT dr.* FROM drs dr
      JOIN spec_versions sv ON dr.spec_version_id = sv.id
      JOIN specs s ON sv.spec_id = s.id
      WHERE s.project_id = ?
    `
      )
      .all(srcPid);

    for (const dr of drRows) {
      const newSv = svMap[dr.spec_version_id];
      if (!newSv) continue;
      const publicId = nextPublicId('DR', 'dr');
      const ins = db
        .prepare(
          `
        INSERT INTO drs (
          public_id, spec_version_id, excerpt, anchor_hint, stale, stale_reason, asil,
          category, labels, status, priority, description, comments, spec_reference, artifact_id, project_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        RETURNING id
      `
        )
        .get(
          publicId,
          newSv,
          dr.excerpt,
          dr.anchor_hint,
          dr.stale,
          dr.stale_reason,
          dr.asil,
          dr.category,
          dr.labels,
          dr.status,
          dr.priority,
          dr.description,
          dr.comments,
          dr.spec_reference,
          dstPid
        );
      drMap[dr.id] = ins.id;
    }

    const vrRows = db.prepare(`SELECT * FROM vrs WHERE project_id = ? ORDER BY id`).all(srcPid);

    for (const vr of vrRows) {
      const vrKind = vr.vr_kind || 'VR';
      const { prefix, counterKey } = kindToIdParts(vrKind);
      const publicId = nextPublicId(prefix, counterKey);
      let evidence_links = vr.evidence_links;
      const ins = db
        .prepare(
          `
        INSERT INTO vrs (
          public_id, vr_kind, title, description, status, priority, owner, location_scope,
          verification_method, milestone_gate, evidence_links, last_verified, asil,
          category, labels, artifact_id, project_id, stale, stale_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        RETURNING id
      `
        )
        .get(
          publicId,
          vrKind,
          vr.title,
          vr.description,
          vr.status,
          vr.priority,
          vr.owner,
          vr.location_scope,
          vr.verification_method,
          vr.milestone_gate,
          evidence_links,
          vr.last_verified,
          vr.asil,
          vr.category,
          vr.labels,
          dstPid,
          vr.stale,
          vr.stale_reason
        );
      vrMap[vr.id] = ins.id;
    }

    const links = db
      .prepare(
        `
      SELECT v.vr_id, v.dr_id FROM vr_dr_links v
      JOIN vrs vr ON vr.id = v.vr_id
      WHERE vr.project_id = ?
    `
      )
      .all(srcPid);

    for (const L of links) {
      const nv = vrMap[L.vr_id];
      const nd = drMap[L.dr_id];
      if (nv && nd) {
        db.prepare(`INSERT OR IGNORE INTO vr_dr_links (vr_id, dr_id) VALUES (?, ?)`).run(nv, nd);
      }
    }

    for (const vr of vrRows) {
      const cov = db.prepare(`SELECT hits, source, last_seen_at FROM vr_coverage WHERE vr_id = ?`).get(vr.id);
      const nid = vrMap[vr.id];
      if (cov && nid) {
        db.prepare(`INSERT OR REPLACE INTO vr_coverage (vr_id, hits, source, last_seen_at) VALUES (?, ?, ?, ?)`).run(
          nid,
          cov.hits,
          cov.source,
          cov.last_seen_at
        );
      }
      if (nid) {
        const files = db.prepare(`SELECT file_path, test_name FROM vr_coverage_files WHERE vr_id = ?`).all(vr.id);
        for (const f of files) {
          db.prepare(
            `INSERT OR IGNORE INTO vr_coverage_files (vr_id, file_path, test_name) VALUES (?, ?, ?)`
          ).run(nid, f.file_path, f.test_name);
        }
      }
    }
  });

  tx();
}
