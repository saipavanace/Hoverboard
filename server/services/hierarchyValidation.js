import { db } from '../db.js';

/** Returns true if assigning parentId as parent of teamId would create a cycle. */
export function teamHierarchyWouldCycle(teamId, parentId) {
  if (!parentId || parentId === teamId) return true;
  let cur = parentId;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    if (cur === teamId) return true;
    const row = db.prepare(`SELECT parent_team_id FROM teams WHERE id = ?`).get(cur);
    cur = row?.parent_team_id || null;
  }
  return false;
}

/** Returns true if assigning managerId as manager of userId would create a cycle in manager graph. */
export function managerAssignmentWouldCycle(userId, managerId) {
  if (!managerId || managerId === userId) return true;
  let cur = managerId;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    if (cur === userId) return true;
    const row = db.prepare(`SELECT manager_user_id FROM users WHERE id = ?`).get(cur);
    cur = row?.manager_user_id || null;
  }
  return false;
}
