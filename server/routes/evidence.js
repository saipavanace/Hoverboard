import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { requireProjectPermission } from '../middleware/permissions.js';
import { projectIdFromArtifact } from '../services/projectResolution.js';
import { appendAuditEvent } from '../services/auditEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

function storageRoot(projectId) {
  const root = path.join(__dirname, '..', 'storage', 'projects', String(projectId), 'evidence');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function uploadMiddleware(projectId) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, storageRoot(projectId));
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '') || '';
        const base = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        cb(null, base + ext);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const name = file.originalname || '';
      const ok = /\.(log|txt|pdf|csv|json|png|jpg|jpeg|gif|webp|svg)$/i.test(name);
      if (!ok) return cb(new Error('unsupported file type'));
      cb(null, true);
    },
  }).single('file');
}

router.post(
  '/projects/:projectId/evidence/upload',
  requireProjectPermission('evidence_write', (req) => Number(req.params.projectId)),
  (req, res, next) => {
    const pid = Number(req.params.projectId);
    uploadMiddleware(pid)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'upload failed' });
      next();
    });
  },
  (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!req.file) return res.status(400).json({ error: 'file required (multipart field "file")' });

    let artifactId = req.body?.artifact_id ? Number(req.body.artifact_id) : null;
    let artifactVersionId = req.body?.artifact_version_id ? Number(req.body.artifact_version_id) : null;
    if (artifactId && Number.isNaN(artifactId)) artifactId = null;
    if (artifactVersionId && Number.isNaN(artifactVersionId)) artifactVersionId = null;

    if (artifactId) {
      const apid = projectIdFromArtifact(artifactId);
      if (apid !== projectId) return res.status(400).json({ error: 'artifact project mismatch' });
    }
    if (artifactVersionId && artifactId) {
      const ver = db
        .prepare(`SELECT artifact_id FROM artifact_versions WHERE id = ?`)
        .get(artifactVersionId);
      if (!ver || ver.artifact_id !== artifactId) {
        return res.status(400).json({ error: 'artifact_version does not match artifact' });
      }
    }

    const absPath = req.file.path;
    const buf = fs.readFileSync(absPath);
    const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
    const relFromServer = path.relative(path.join(__dirname, '..'), absPath);
    const originalName = req.file.originalname || path.basename(absPath);
    const uploadedBy = req.authUser?.id ?? null;

    const meta = {
      mime_type: req.file.mimetype || null,
      size: buf.length,
      multer_fieldname: req.file.fieldname,
    };

    const ins = db
      .prepare(
        `
      INSERT INTO evidence_files (
        file_hash, storage_path, metadata_json, project_id, file_name,
        artifact_id, artifact_version_id, uploaded_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `
      )
      .get(
        fileHash,
        relFromServer,
        JSON.stringify(meta),
        projectId,
        originalName,
        artifactId,
        artifactVersionId,
        uploadedBy
      );

    appendAuditEvent({
      actorUserId: uploadedBy,
      action: 'EVIDENCE_UPLOAD',
      entityType: 'EVIDENCE_FILE',
      entityId: String(ins.id),
      detail: { project_id: projectId, artifact_id: artifactId, file_hash: fileHash },
      mirrorLegacy: true,
    });

    res.status(201).json({
      id: ins.id,
      file_name: originalName,
      file_hash: fileHash,
      storage_path: relFromServer,
      artifact_id: artifactId,
      artifact_version_id: artifactVersionId,
    });
  }
);

router.get(
  '/projects/:projectId/evidence',
  requireProjectPermission('evidence_read', (req) => Number(req.params.projectId)),
  (req, res) => {
    const projectId = Number(req.params.projectId);
    const artifactId = req.query.artifact_id ? Number(req.query.artifact_id) : null;
    let rows;
    if (artifactId && !Number.isNaN(artifactId)) {
      rows = db
        .prepare(
          `
        SELECT id, file_name, file_hash, storage_path, metadata_json, created_at,
               artifact_id, artifact_version_id, uploaded_by_user_id, project_id
        FROM evidence_files
        WHERE project_id = ? AND artifact_id = ?
        ORDER BY id DESC
      `
        )
        .all(projectId, artifactId);
    } else {
      rows = db
        .prepare(
          `
        SELECT id, file_name, file_hash, storage_path, metadata_json, created_at,
               artifact_id, artifact_version_id, uploaded_by_user_id, project_id
        FROM evidence_files
        WHERE project_id = ?
        ORDER BY id DESC
        LIMIT 500
      `
        )
        .all(projectId);
    }
    res.json(rows);
  }
);

router.patch(
  '/projects/:projectId/evidence/:evidenceId',
  requireProjectPermission('evidence_write', (req) => Number(req.params.projectId)),
  (req, res) => {
    const projectId = Number(req.params.projectId);
    const evidenceId = Number(req.params.evidenceId);
    const row = db.prepare(`SELECT * FROM evidence_files WHERE id = ? AND project_id = ?`).get(evidenceId, projectId);
    if (!row) return res.status(404).json({ error: 'not found' });

    let { artifact_id, artifact_version_id } = req.body || {};
    if (artifact_id === undefined && artifact_version_id === undefined) {
      return res.status(400).json({ error: 'artifact_id and/or artifact_version_id required' });
    }

    let artifactId = artifact_id !== undefined ? (artifact_id === null ? null : Number(artifact_id)) : row.artifact_id;
    let artifactVersionId =
      artifact_version_id !== undefined
        ? artifact_version_id === null
          ? null
          : Number(artifact_version_id)
        : row.artifact_version_id;

    if (artifactId) {
      const apid = projectIdFromArtifact(artifactId);
      if (apid !== projectId) return res.status(400).json({ error: 'artifact project mismatch' });
    } else {
      artifactVersionId = null;
    }

    if (artifactVersionId && artifactId) {
      const ver = db.prepare(`SELECT artifact_id FROM artifact_versions WHERE id = ?`).get(artifactVersionId);
      if (!ver || ver.artifact_id !== artifactId) {
        return res.status(400).json({ error: 'artifact_version does not match artifact' });
      }
    }

    db.prepare(
      `
      UPDATE evidence_files SET artifact_id = ?, artifact_version_id = ? WHERE id = ?
    `
    ).run(artifactId, artifactVersionId, evidenceId);

    appendAuditEvent({
      actorUserId: req.authUser?.id,
      action: 'EVIDENCE_LINK',
      entityType: 'EVIDENCE_FILE',
      entityId: String(evidenceId),
      detail: { artifact_id: artifactId, artifact_version_id: artifactVersionId },
      mirrorLegacy: true,
    });

    res.json({ ok: true });
  }
);

router.get(
  '/projects/:projectId/evidence/:evidenceId/download',
  requireProjectPermission('evidence_read', (req) => Number(req.params.projectId)),
  (req, res) => {
    const projectId = Number(req.params.projectId);
    const evidenceId = Number(req.params.evidenceId);
    const row = db.prepare(`SELECT * FROM evidence_files WHERE id = ? AND project_id = ?`).get(evidenceId, projectId);
    if (!row) return res.status(404).json({ error: 'not found' });
    const serverRoot = path.join(__dirname, '..');
    const abs = path.join(serverRoot, row.storage_path);
    if (!abs.startsWith(serverRoot) || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'file missing on disk' });
    }
    const downloadName = row.file_name || path.basename(abs);
    res.download(abs, downloadName);
  }
);

export default router;
