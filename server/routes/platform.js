import { Router } from 'express';
import { db } from '../db.js';
import { appendAuditEvent } from '../services/auditEvents.js';
import { authDisabled } from '../middleware/auth.js';
import { can, hasGlobalRole, GLOBAL_ADMIN } from '../middleware/rbac.js';
import { hashPassword } from '../services/password.js';
import { isBuiltinAdminEmail } from '../services/builtinAdmin.js';
import { evaluateSignoff, computeApprovalSignature } from '../services/signoffEngine.js';
import { requireProjectPermission } from '../middleware/permissions.js';
import { projectIdFromArtifact } from '../services/projectResolution.js';
import { managerAssignmentWouldCycle } from '../services/hierarchyValidation.js';
import { loadConfig } from '../config.js';

const router = Router();

function defaultProjectId() {
  const row = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  return row?.id ?? 1;
}

function requireAdmin(req, res, next) {
  if (authDisabled()) return next();
  if (!hasGlobalRole(req.authUser, GLOBAL_ADMIN) && !can(req.authUser, defaultProjectId(), 'admin_users')) {
    return res.status(403).json({ error: 'admin required' });
  }
  return next();
}

/** Global system administrator only (user directory, roles). */
function requireSystemAdmin(req, res, next) {
  if (authDisabled()) return next();
  if (!hasGlobalRole(req.authUser, GLOBAL_ADMIN)) {
    return res.status(403).json({ error: 'system administrator required' });
  }
  return next();
}

function requireAdminOrAuditor(req, res, next) {
  if (authDisabled()) return next();
  if (hasGlobalRole(req.authUser, 'auditor')) return next();
  return requireAdmin(req, res, next);
}

function lookupProjectFromQuery(req) {
  const pub = String(req.query.public_id || '').trim();
  const type = String(req.query.type || 'DR').toUpperCase();
  if (!pub) return null;
  if (type === 'VR') {
    return db.prepare(`SELECT project_id FROM vrs WHERE public_id = ?`).get(pub)?.project_id ?? null;
  }
  return db.prepare(`SELECT project_id FROM drs WHERE public_id = ?`).get(pub)?.project_id ?? null;
}

/** Lookup artifact by DR or VR public id */
router.get(
  '/graph/artifacts/lookup',
  requireProjectPermission('specs_read', lookupProjectFromQuery),
  (req, res) => {
  const pub = String(req.query.public_id || '').trim();
  const type = String(req.query.type || 'DR').toUpperCase();
  if (!pub) return res.status(400).json({ error: 'public_id required' });
  let row;
  if (type === 'VR') {
    row = db.prepare(`SELECT artifact_id, project_id FROM vrs WHERE public_id = ?`).get(pub);
  } else {
    row = db.prepare(`SELECT artifact_id, project_id FROM drs WHERE public_id = ?`).get(pub);
  }
  if (!row?.artifact_id) return res.status(404).json({ error: 'artifact not found (run sync or recreate)' });
  const art = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(row.artifact_id);
  res.json({ artifact: art, project_id: row.project_id || art.project_id });
  }
);

router.get(
  '/graph/artifacts/:artifactId/comments',
  requireProjectPermission('specs_read', (req) => projectIdFromArtifact(Number(req.params.artifactId))),
  (req, res) => {
  const artifactId = Number(req.params.artifactId);
  const rows = db
    .prepare(
      `
    SELECT c.*, u.email AS author_email, u.display_name AS author_name
    FROM artifact_comments c
    JOIN users u ON u.id = c.author_user_id
    WHERE c.artifact_id = ? AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
  `
    )
    .all(artifactId);
  res.json(rows);
  }
);

router.post(
  '/graph/artifacts/:artifactId/comments',
  requireProjectPermission('comments_write', (req) =>
    projectIdFromArtifact(Number(req.params.artifactId))
  ),
  (req, res) => {
    const artifactId = Number(req.params.artifactId);
    const actorId = req.authUser?.id;
    if (!actorId) return res.status(401).json({ error: 'login required' });

  const { body, parent_comment_id } = req.body || {};
  if (!body || !String(body).trim()) return res.status(400).json({ error: 'body required' });

  const ins = db
    .prepare(
      `
    INSERT INTO artifact_comments (artifact_id, parent_comment_id, body, author_user_id)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `
    )
    .get(artifactId, parent_comment_id || null, String(body).trim(), actorId);

  appendAuditEvent({
    actorUserId: actorId,
    action: 'COMMENT_CREATE',
    entityType: 'ARTIFACT_COMMENT',
    entityId: String(ins.id),
    detail: { artifact_id: artifactId },
    mirrorLegacy: true,
  });

  res.status(201).json({ id: ins.id });
  }
);

router.patch(
  '/graph/comments/:commentId',
  requireProjectPermission('comments_write', (req) => {
    const commentId = Number(req.params.commentId);
    const row = db
      .prepare(`SELECT a.project_id FROM artifact_comments c JOIN artifacts a ON a.id = c.artifact_id WHERE c.id = ?`)
      .get(commentId);
    return row?.project_id ?? null;
  }),
  (req, res) => {
    const commentId = Number(req.params.commentId);
    const actorId = req.authUser?.id;
    if (!actorId) return res.status(401).json({ error: 'login required' });

    const existing = db.prepare(`SELECT id FROM artifact_comments WHERE id = ?`).get(commentId);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const { resolved } = req.body || {};
    if (resolved === true) {
      db.prepare(
        `
      UPDATE artifact_comments SET resolved = 1, resolved_at = datetime('now'), resolved_by_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `
      ).run(actorId, commentId);
    } else if (resolved === false) {
      db.prepare(
        `
      UPDATE artifact_comments SET resolved = 0, resolved_at = NULL, resolved_by_user_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `
      ).run(commentId);
    } else {
      return res.status(400).json({ error: 'resolved boolean required' });
    }

    appendAuditEvent({
      actorUserId: actorId,
      action: 'COMMENT_RESOLVE',
      entityType: 'ARTIFACT_COMMENT',
      entityId: String(commentId),
      detail: { resolved },
      mirrorLegacy: true,
    });

    res.json({ ok: true });
  }
);

router.post(
  '/graph/artifacts/:artifactId/approvals',
  requireProjectPermission('approvals_act', (req) =>
    projectIdFromArtifact(Number(req.params.artifactId))
  ),
  (req, res) => {
    const artifactId = Number(req.params.artifactId);
    const art = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(artifactId);
    if (!art) return res.status(404).json({ error: 'artifact not found' });
    const projectId = art.project_id;

    const approverId = req.authUser?.id;
    if (!approverId) return res.status(401).json({ error: 'login required' });

  const decision = String(req.body?.decision || 'approve').toLowerCase();
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve or reject' });
  }

  const ver = db
    .prepare(`SELECT * FROM artifact_versions WHERE id = ?`)
    .get(art.current_version_id);
  if (!ver) return res.status(400).json({ error: 'artifact has no current version' });

  const approverRoles = db
    .prepare(`SELECT role FROM user_project_roles WHERE user_id = ? AND project_id = ?`)
    .all(approverId, projectId)
    .map((r) => r.role);

  const authorId = art.created_by_user_id || approverId;
  const evalResult = evaluateSignoff({
    projectId,
    artifactType: art.artifact_type,
    asilLevel: art.asil_level,
    approverUserId: approverId,
    authorUserId: authorId,
    approverProjectRoles: approverRoles,
  });
  if (!evalResult.ok) {
    return res.status(403).json({ error: evalResult.reason || 'sign-off rules blocked approval' });
  }

  const ts = new Date().toISOString();
  const signature_hash = computeApprovalSignature({
    artifactVersionId: ver.id,
    userId: approverId,
    timestampIso: ts,
    contentHash: ver.content_hash,
  });

  const ins = db
    .prepare(
      `
    INSERT INTO artifact_approvals (artifact_id, artifact_version_id, approved_by_user_id, decision, signature_hash)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `
    )
    .get(artifactId, ver.id, approverId, decision === 'approve' ? 'approved' : 'rejected', signature_hash);

  appendAuditEvent({
    actorUserId: approverId,
    action: 'APPROVAL',
    entityType: 'ARTIFACT',
    entityId: String(artifactId),
    detail: { version_id: ver.id, decision, signature_hash },
    mirrorLegacy: true,
  });

  res.status(201).json({ id: ins.id, signature_hash });
  }
);

router.get(
  '/graph/artifacts/:artifactId/approvals',
  requireProjectPermission('specs_read', (req) =>
    projectIdFromArtifact(Number(req.params.artifactId))
  ),
  (req, res) => {
  const artifactId = Number(req.params.artifactId);
  const rows = db
    .prepare(
      `
    SELECT a.*, u.email AS approver_email, u.display_name AS approver_name
    FROM artifact_approvals a
    JOIN users u ON u.id = a.approved_by_user_id
    WHERE a.artifact_id = ?
    ORDER BY a.id DESC
  `
    )
    .all(artifactId);
  res.json(rows);
  }
);

router.get('/graph/artifacts/:artifactId',
  requireProjectPermission('specs_read', (req) =>
    projectIdFromArtifact(Number(req.params.artifactId))
  ),
  (req, res) => {
    const id = Number(req.params.artifactId);
    const art = db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id);
    if (!art) return res.status(404).json({ error: 'not found' });
    const dr = db.prepare(`SELECT public_id FROM drs WHERE artifact_id = ? LIMIT 1`).get(id);
    const vr = db.prepare(`SELECT public_id FROM vrs WHERE artifact_id = ? LIMIT 1`).get(id);
    res.json({
      artifact: art,
      dr_public_id: dr?.public_id ?? null,
      vr_public_id: vr?.public_id ?? null,
    });
  }
);

/** Non-secret auth summary for Admin UI (system admin only). */
router.get('/admin/auth-overview', requireSystemAdmin, (_req, res) => {
  const cfg = loadConfig();
  const a = cfg.auth || {};
  const oidc = a.oidc || {};
  res.json({
    localLoginEnabled: a.localLoginEnabled !== false,
    localLoginDisabledInProduction: Boolean(a.localLoginDisabledInProduction),
    syncProfileOnLogin: a.syncProfileOnLogin !== false,
    allowManualProfileOverride: a.allowManualProfileOverride !== false,
    linkExistingUserByEmail: a.linkExistingUserByEmail !== false,
    roleMappings: a.roleMappings || [],
    providers: [
      {
        id: 'local',
        type: 'local_password',
        enabled: a.localLoginEnabled !== false,
      },
      {
        id: 'oidc',
        type: 'oidc',
        configured: Boolean(oidc.issuerUrl && oidc.clientId && oidc.redirectUri),
        issuerUrl: oidc.issuerUrl || null,
        groupsClaimPaths: oidc.groupsClaimPaths || [],
      },
      {
        id: 'ldap',
        type: 'ldap',
        enabled: Boolean(a.ldap?.enabled),
        urlHint: a.ldap?.url ? String(a.ldap.url).replace(/:\/\/[^/]+/, '://***') : null,
      },
    ],
  });
});

/** Distinct directory groups seen on user records (for admin review of IdP → role mapping). */
router.get('/admin/synced-groups', requireSystemAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT provider, group_name, COUNT(*) AS user_count
       FROM user_synced_groups
       GROUP BY provider, group_name
       ORDER BY provider, group_name`
    )
    .all();
  res.json(rows);
});

router.get('/admin/users', requireSystemAdmin, (_req, res) => {
  const users = db
    .prepare(
      `SELECT id, email, display_name, enabled, created_at, team_id, manager_user_id, department, job_title FROM users ORDER BY id`
    )
    .all();
  const out = users.map((u) => ({
    ...u,
    global_roles: db.prepare(`SELECT role FROM user_global_roles WHERE user_id = ?`).all(u.id).map((r) => r.role),
    project_roles: db
      .prepare(`SELECT project_id, role FROM user_project_roles WHERE user_id = ?`)
      .all(u.id),
  }));
  res.json(out);
});

router.post('/admin/users', requireSystemAdmin, (req, res) => {
  const { email, display_name, password, global_roles, project_roles } = req.body || {};
  if (!email || !display_name) return res.status(400).json({ error: 'email and display_name required' });
  const em = String(email).trim().toLowerCase();
  if (isBuiltinAdminEmail(em)) return res.status(403).json({ error: 'reserved account' });
  const hash = password ? hashPassword(String(password)) : null;
  try {
    const ins = db
      .prepare(
        `
      INSERT INTO users (email, display_name, password_hash, enabled)
      VALUES (?, ?, ?, 1)
      RETURNING id
    `
      )
      .get(em, String(display_name).trim(), hash);

    for (const r of global_roles || []) {
      db.prepare(`INSERT INTO user_global_roles (user_id, role) VALUES (?, ?)`).run(ins.id, r);
    }
    for (const pr of project_roles || []) {
      db.prepare(`INSERT INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, ?)`).run(
        ins.id,
        pr.project_id,
        pr.role
      );
    }

    appendAuditEvent({
      actorUserId: req.authUser?.id,
      action: 'ADMIN_USER_CREATE',
      entityType: 'USER',
      entityId: String(ins.id),
      detail: { email: em },
      mirrorLegacy: true,
    });

    res.status(201).json({ id: ins.id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'email exists' });
    throw e;
  }
});

router.patch('/admin/users/:id', requireSystemAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT email FROM users WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (isBuiltinAdminEmail(row.email)) return res.status(403).json({ error: 'built-in administrator cannot be modified' });
  const { enabled, display_name, team_id, manager_user_id, department, job_title } = req.body || {};
  const sets = [];
  const vals = [];
  if (enabled !== undefined) {
    sets.push('enabled = ?');
    vals.push(enabled ? 1 : 0);
  }
  if (display_name !== undefined) {
    sets.push('display_name = ?');
    vals.push(String(display_name));
  }
  if (department !== undefined) {
    sets.push('department = ?');
    vals.push(department === null ? null : String(department));
  }
  if (job_title !== undefined) {
    sets.push('job_title = ?');
    vals.push(job_title === null ? null : String(job_title));
  }
  if (team_id !== undefined) {
    const tid = team_id === null ? null : Number(team_id);
    if (tid) {
      const t = db.prepare(`SELECT id FROM teams WHERE id = ?`).get(tid);
      if (!t) return res.status(400).json({ error: 'invalid team_id' });
    }
    sets.push('team_id = ?');
    vals.push(tid);
  }
  if (manager_user_id !== undefined) {
    const mid = manager_user_id === null ? null : Number(manager_user_id);
    if (mid) {
      const u = db.prepare(`SELECT id FROM users WHERE id = ?`).get(mid);
      if (!u) return res.status(400).json({ error: 'invalid manager_user_id' });
      if (managerAssignmentWouldCycle(id, mid)) {
        return res.status(400).json({ error: 'circular manager assignment' });
      }
    }
    sets.push('manager_user_id = ?');
    vals.push(mid);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
  appendAuditEvent({
    actorUserId: req.authUser?.id,
    action: 'ADMIN_USER_UPDATE',
    entityType: 'USER',
    entityId: String(id),
    detail: { enabled, display_name },
    mirrorLegacy: true,
  });
  res.json({ ok: true });
});

router.post('/admin/users/:id/roles', requireSystemAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT email FROM users WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (isBuiltinAdminEmail(row.email)) return res.status(403).json({ error: 'built-in administrator cannot be modified' });
  const { global_roles, project_roles } = req.body || {};
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM user_global_roles WHERE user_id = ?`).run(id);
    db.prepare(`DELETE FROM user_project_roles WHERE user_id = ?`).run(id);
    for (const r of global_roles || []) {
      db.prepare(`INSERT INTO user_global_roles (user_id, role) VALUES (?, ?)`).run(id, r);
    }
    for (const pr of project_roles || []) {
      db.prepare(`INSERT INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, ?)`).run(
        id,
        pr.project_id,
        pr.role
      );
    }
  });
  tx();
  appendAuditEvent({
    actorUserId: req.authUser?.id,
    action: 'ADMIN_ROLES_UPDATE',
    entityType: 'USER',
    entityId: String(id),
    detail: {},
    mirrorLegacy: true,
  });
  res.json({ ok: true });
});

router.get('/admin/signoff-rules', requireAdmin, (_req, res) => {
  const pid = defaultProjectId();
  const rows = db.prepare(`SELECT * FROM signoff_rules WHERE project_id = ? ORDER BY id`).all(pid);
  res.json(rows);
});

router.post('/admin/signoff-rules', requireAdmin, (req, res) => {
  const pid = defaultProjectId();
  const {
    artifact_type,
    asil_level,
    required_project_role,
    independence_level,
    allow_author_approval,
    enabled,
  } = req.body || {};
  const ins = db
    .prepare(
      `
    INSERT INTO signoff_rules (
      project_id, artifact_type, asil_level, required_project_role, independence_level, allow_author_approval, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `
    )
    .get(
      pid,
      artifact_type || null,
      asil_level || null,
      required_project_role || 'approver',
      independence_level ?? 0,
      allow_author_approval === false ? 0 : 1,
      enabled === false ? 0 : 1
    );
  res.status(201).json({ id: ins.id });
});

router.get('/admin/baselines', requireAdmin, (_req, res) => {
  const pid = defaultProjectId();
  const rows = db.prepare(`SELECT * FROM baselines WHERE project_id = ? ORDER BY id DESC`).all(pid);
  res.json(rows);
});

router.post('/admin/baselines', requireAdmin, (req, res) => {
  const pid = defaultProjectId();
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const uid = req.authUser?.id;
  try {
    const base = db
      .prepare(
        `
      INSERT INTO baselines (project_id, name, description, created_by_user_id)
      VALUES (?, ?, ?, ?)
      RETURNING id
    `
      )
      .get(pid, String(name).trim(), description || null, uid);

    const artifacts = db.prepare(`SELECT id, current_version_id FROM artifacts WHERE project_id = ?`).all(pid);
    const insItem = db.prepare(
      `INSERT INTO baseline_items (baseline_id, artifact_id, artifact_version_id) VALUES (?, ?, ?)`
    );
    for (const a of artifacts) {
      if (a.current_version_id) insItem.run(base.id, a.id, a.current_version_id);
    }

    appendAuditEvent({
      actorUserId: uid,
      action: 'BASELINE_CREATE',
      entityType: 'BASELINE',
      entityId: String(base.id),
      detail: { name, artifacts: artifacts.length },
      mirrorLegacy: true,
    });

    res.status(201).json({ id: base.id, artifact_count: artifacts.length });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'baseline name exists' });
    throw e;
  }
});

router.get('/admin/baselines/:id/export', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = db.prepare(`SELECT * FROM baselines WHERE id = ?`).get(id);
  if (!b) return res.status(404).json({ error: 'not found' });
  const items = db
    .prepare(
      `
    SELECT bi.*, a.external_id, a.artifact_type, av.content_hash, av.version_number
    FROM baseline_items bi
    JOIN artifacts a ON a.id = bi.artifact_id
    JOIN artifact_versions av ON av.id = bi.artifact_version_id
    WHERE bi.baseline_id = ?
  `
    )
    .all(id);
  res.json({ baseline: b, items });
});

router.get('/admin/audit-events', requireAdminOrAuditor, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 500, 5000);
  const rows = db.prepare(`SELECT * FROM audit_events ORDER BY id DESC LIMIT ?`).all(limit);
  res.json(rows);
});

export default router;
