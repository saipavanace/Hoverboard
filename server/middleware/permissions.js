import { db } from '../db.js';
import { authDisabled } from './auth.js';
import { accessibleProjectIds, can, userHasProjectAccess } from './rbac.js';

/** Maps external / docs names to internal rbac keys */
export function normalizePermissionKey(key) {
  const aliases = {
    'project.read': 'specs_read',
    'artifact.comment': 'comments_write',
    'artifact.approve': 'approvals_act',
    'artifact.edit': 'vrs_write',
    'artifact.create': 'drs_write',
    'evidence.read': 'evidence_read',
    'evidence.write': 'evidence_write',
  };
  return aliases[key] || key;
}

function defaultProjectId() {
  const row = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  return row?.id ?? 1;
}

/**
 * Header X-Project-Id → query project_id → body.project_id → singleton role assignment.
 */
export function resolveExplicitProjectId(req) {
  const h = req.headers['x-project-id'];
  const q = req.query?.project_id;
  const b = req.body?.project_id;
  let p = Number(h || q || b);
  if (Number.isFinite(p) && p > 0) return p;
  if (req.authUser && !req.authUser.authDisabled) {
    const ids = Object.keys(req.authUser.project_roles || {})
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (ids.length === 1) return ids[0];
  }
  return null;
}

export function resolveWithDefaultProject(req) {
  return resolveExplicitProjectId(req) ?? defaultProjectId();
}

/**
 * Enforce permission on a resolved project id (403 if no access / insufficient role).
 */
/**
 * List endpoints: filter to accessible projects; require explicit project when user has >1.
 */
export function requireListAccess(readPermission) {
  return (req, res, next) => {
    if (authDisabled()) {
      req.listProjectIds = null;
      return next();
    }
    const pid = resolveExplicitProjectId(req);
    if (pid) {
      if (!userHasProjectAccess(req.authUser, pid)) return res.status(403).json({ error: 'forbidden' });
      if (!can(req.authUser, pid, readPermission)) return res.status(403).json({ error: 'forbidden' });
      req.listProjectIds = [pid];
      return next();
    }
    const acc = accessibleProjectIds(req.authUser);
    if (acc === null) {
      req.listProjectIds = null;
      return next();
    }
    if (!acc.length) return res.status(403).json({ error: 'no project access' });
    if (acc.length === 1) {
      if (!can(req.authUser, acc[0], readPermission)) return res.status(403).json({ error: 'forbidden' });
      req.listProjectIds = acc;
      return next();
    }
    return res.status(400).json({
      error: 'Pass project_id query parameter or X-Project-Id when you belong to multiple projects',
    });
  };
}

export function requireProjectPermission(permissionKey, projectIdResolver) {
  return (req, res, next) => {
    if (authDisabled()) {
      const row = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
      req.resolvedProjectId = row?.id ?? 1;
      return next();
    }
    const rawPid = typeof projectIdResolver === 'function' ? projectIdResolver(req) : projectIdResolver;
    const pid = rawPid != null ? Number(rawPid) : null;
    if (pid == null || Number.isNaN(pid)) {
      return res.status(400).json({
        error:
          'project context required (X-Project-Id header, project_id query/body, or implied from resource)',
      });
    }
    if (!userHasProjectAccess(req.authUser, pid)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const perm = normalizePermissionKey(permissionKey);
    if (!can(req.authUser, pid, perm)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    req.resolvedProjectId = pid;
    next();
  };
}
