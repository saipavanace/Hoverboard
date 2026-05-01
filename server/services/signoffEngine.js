import crypto from 'crypto';
import { db } from '../db.js';

export function computeApprovalSignature({ artifactVersionId, userId, timestampIso, contentHash }) {
  const payload = JSON.stringify({
    artifact_version_id: artifactVersionId,
    user_id: userId,
    timestamp: timestampIso,
    content_hash: contentHash,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function roleCovers(requiredRole, actualRoles) {
  const order = ['viewer', 'engineer', 'reviewer', 'approver', 'safety_manager', 'project_admin'];
  const ri = order.indexOf(requiredRole);
  if (ri < 0) return actualRoles.includes(requiredRole);
  return actualRoles.some((r) => {
    const ai = order.indexOf(r);
    return ai >= ri;
  });
}

function userTeamsChain(userId) {
  const u = db.prepare(`SELECT id, team_id, department, manager_user_id FROM users WHERE id = ?`).get(userId);
  return u;
}

function sameReportingChain(aId, bId) {
  if (aId === bId) return true;
  const visited = new Set();
  let cur = aId;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const row = db.prepare(`SELECT manager_user_id FROM users WHERE id = ?`).get(cur);
    if (!row?.manager_user_id) break;
    if (row.manager_user_id === bId) return true;
    cur = row.manager_user_id;
  }
  visited.clear();
  cur = bId;
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const row = db.prepare(`SELECT manager_user_id FROM users WHERE id = ?`).get(cur);
    if (!row?.manager_user_id) break;
    if (row.manager_user_id === aId) return true;
    cur = row.manager_user_id;
  }
  return false;
}

/**
 * Returns { ok: true } or { ok: false, reason: string }
 */
export function evaluateSignoff({
  projectId,
  artifactType,
  asilLevel,
  approverUserId,
  authorUserId,
  approverProjectRoles,
}) {
  const rules = db
    .prepare(
      `
    SELECT * FROM signoff_rules
    WHERE project_id = ? AND enabled = 1
      AND (artifact_type IS NULL OR artifact_type = ? OR artifact_type = '')
      AND (asil_level IS NULL OR asil_level = '' OR asil_level = ?)
    ORDER BY id ASC
  `
    )
    .all(projectId, artifactType, asilLevel || '');

  if (!rules.length) {
    return { ok: true };
  }

  const approver = userTeamsChain(approverUserId);
  const author = userTeamsChain(authorUserId);

  for (const rule of rules) {
    const reqRole = rule.required_project_role || 'approver';
    if (!roleCovers(reqRole, approverProjectRoles)) {
      return { ok: false, reason: `Approver needs role at least: ${reqRole}` };
    }

    if (!rule.allow_author_approval && approverUserId === authorUserId) {
      return { ok: false, reason: 'Author cannot approve this artifact type (policy).' };
    }

    const level = Number(rule.independence_level ?? 0);
    if (level >= 1 && approverUserId === authorUserId) {
      return { ok: false, reason: `Independence I${level}: approver must differ from author.` };
    }
    if (level >= 2 && approver && author && approver.team_id && author.team_id && approver.team_id === author.team_id) {
      return { ok: false, reason: 'Independence I2: approver must be on a different team.' };
    }
    if (level >= 3 && approver && author) {
      const sameDept =
        approver.department &&
        author.department &&
        String(approver.department).toLowerCase() === String(author.department).toLowerCase();
      const chain = sameReportingChain(approverUserId, authorUserId);
      if (sameDept || chain) {
        return {
          ok: false,
          reason:
            'Independence I3: approver must differ by department and not share reporting chain with author.',
        };
      }
    }
  }

  return { ok: true };
}
