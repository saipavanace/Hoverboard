import { authDisabled } from './auth.js';

/** Global roles */
const GLOBAL_ADMIN = 'system_admin';
const GLOBAL_AUDITOR = 'auditor';

/** Project roles (ordered weakest → strongest for coverage checks) */
const PROJECT_ROLES = [
  'viewer',
  'engineer',
  'reviewer',
  'approver',
  'safety_manager',
  'project_admin',
];

function projectRoleRank(role) {
  const i = PROJECT_ROLES.indexOf(role);
  return i === -1 ? -1 : i;
}

function maxProjectCapability(roles) {
  let best = -1;
  for (const r of roles || []) {
    best = Math.max(best, projectRoleRank(r));
  }
  return best;
}

export function getProjectRoles(user, projectId) {
  if (!user) return [];
  if (user.authDisabled) return ['project_admin'];
  const globals = user.global_roles || [];
  if (globals.includes(GLOBAL_ADMIN)) return ['project_admin'];
  const pr = user.project_roles?.[projectId] || user.project_roles?.['*'];
  return pr || [];
}

export function hasGlobalRole(user, role) {
  if (!user) return false;
  if (user.authDisabled) return true;
  return (user.global_roles || []).includes(role);
}

/** User has any role on project (for coarse access checks). */
export function userHasProjectAccess(user, projectId) {
  if (authDisabled()) return true;
  if (!user?.id) return false;
  const globals = user.global_roles || [];
  if (globals.includes(GLOBAL_ADMIN)) return true;
  const pid = Number(projectId);
  const roles = user.project_roles?.[pid];
  return Array.isArray(roles) && roles.length > 0;
}

/** Project IDs the user may access; null = all (global admin / auth disabled). */
export function accessibleProjectIds(user) {
  if (!user || user.authDisabled) return null;
  if (user.global_roles?.includes(GLOBAL_ADMIN)) return null;
  return Object.keys(user.project_roles || {})
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

export function can(user, projectId, permission) {
  if (authDisabled()) return true;
  if (!user?.id) return false;
  const globals = user.global_roles || [];
  if (globals.includes(GLOBAL_ADMIN)) return true;
  if (globals.includes(GLOBAL_AUDITOR)) {
    return (
      permission.startsWith('admin_audit') ||
      permission.endsWith('_read') ||
      permission === 'iso_read' ||
      permission === 'settings_read'
    );
  }

  const pr = getProjectRoles(user, projectId);
  const rank = maxProjectCapability(pr);

  const need = (minRole) => projectRoleRank(minRole) <= rank || pr.includes('project_admin');

  switch (permission) {
    case 'specs_read':
    case 'drs_read':
    case 'vrs_read':
    case 'regressions_read':
    case 'iso_read':
      return need('viewer');
    case 'specs_write':
    case 'drs_write':
    case 'vrs_write':
    case 'comments_write':
      return need('engineer');
    case 'regressions_write':
      return need('engineer');
    case 'settings_read':
      return need('project_admin');
    case 'settings_write':
      return need('project_admin');
    case 'admin_users':
    case 'admin_signoff':
    case 'baselines_write':
      return need('project_admin') || globals.includes(GLOBAL_ADMIN);
    case 'admin_audit':
      return need('project_admin') || globals.includes(GLOBAL_ADMIN) || globals.includes(GLOBAL_AUDITOR);
    case 'approvals_act':
      return need('approver');
    case 'evidence_read':
      return need('viewer');
    case 'evidence_write':
      return need('engineer');
    case 'metrics_read':
      return need('viewer');
    case 'admin_teams':
    case 'admin_projects':
      return need('project_admin') || globals.includes(GLOBAL_ADMIN);
    case 'demo_seed':
      return need('project_admin') || globals.includes(GLOBAL_ADMIN);
    default:
      return false;
  }
}

export function requirePerm(projectIdGetter, permission) {
  return (req, res, next) => {
    if (authDisabled()) return next();
    const pid = typeof projectIdGetter === 'function' ? projectIdGetter(req) : projectIdGetter;
    const projectId = pid ?? req.params?.projectId ?? req.body?.project_id;
    if (!projectId) {
      return res.status(400).json({ error: 'project context required' });
    }
    if (!can(req.authUser, Number(projectId), permission)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

export { PROJECT_ROLES, GLOBAL_ADMIN };
