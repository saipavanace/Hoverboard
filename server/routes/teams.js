import { Router } from 'express';
import { db } from '../db.js';
import { requireProjectPermission } from '../middleware/permissions.js';
import { teamHierarchyWouldCycle } from '../services/hierarchyValidation.js';
import { appendAuditEvent } from '../services/auditEvents.js';

const router = Router();

router.get(
  '/projects/:projectId/teams',
  requireProjectPermission('admin_teams', (req) => Number(req.params.projectId)),
  (req, res) => {
    const pid = Number(req.params.projectId);
    const rows = db.prepare(`SELECT * FROM teams WHERE project_id = ? ORDER BY id`).all(pid);
    res.json(rows);
  }
);

router.post(
  '/projects/:projectId/teams',
  requireProjectPermission('admin_teams', (req) => Number(req.params.projectId)),
  (req, res) => {
    const pid = Number(req.params.projectId);
    const { name, parent_team_id, department } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const parentId = parent_team_id ? Number(parent_team_id) : null;
    if (parentId) {
      const p = db.prepare(`SELECT id FROM teams WHERE id = ? AND project_id = ?`).get(parentId, pid);
      if (!p) return res.status(400).json({ error: 'invalid parent_team_id' });
    }
    const ins = db
      .prepare(
        `
      INSERT INTO teams (project_id, name, parent_team_id, department)
      VALUES (?, ?, ?, ?)
      RETURNING id
    `
      )
      .get(pid, String(name).trim(), parentId || null, department ? String(department) : null);

    appendAuditEvent({
      actorUserId: req.authUser?.id,
      action: 'TEAM_CREATE',
      entityType: 'TEAM',
      entityId: String(ins.id),
      detail: { project_id: pid, parent_team_id: parentId },
      mirrorLegacy: true,
    });

    res.status(201).json({ id: ins.id });
  }
);

router.patch(
  '/projects/:projectId/teams/:teamId',
  requireProjectPermission('admin_teams', (req) => Number(req.params.projectId)),
  (req, res) => {
    const pid = Number(req.params.projectId);
    const teamId = Number(req.params.teamId);
    const row = db.prepare(`SELECT * FROM teams WHERE id = ? AND project_id = ?`).get(teamId, pid);
    if (!row) return res.status(404).json({ error: 'not found' });

    const { name, parent_team_id, department } = req.body || {};
    const sets = [];
    const vals = [];
    if (name !== undefined) {
      sets.push('name = ?');
      vals.push(String(name).trim());
    }
    if (department !== undefined) {
      sets.push('department = ?');
      vals.push(department === null ? null : String(department));
    }
    if (parent_team_id !== undefined) {
      const parentId = parent_team_id === null ? null : Number(parent_team_id);
      if (parentId) {
        const p = db.prepare(`SELECT id FROM teams WHERE id = ? AND project_id = ?`).get(parentId, pid);
        if (!p) return res.status(400).json({ error: 'invalid parent_team_id' });
        if (teamHierarchyWouldCycle(teamId, parentId)) {
          return res.status(400).json({ error: 'circular team hierarchy' });
        }
      }
      sets.push('parent_team_id = ?');
      vals.push(parentId);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(teamId);
    db.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    appendAuditEvent({
      actorUserId: req.authUser?.id,
      action: 'TEAM_UPDATE',
      entityType: 'TEAM',
      entityId: String(teamId),
      detail: { project_id: pid },
      mirrorLegacy: true,
    });

    res.json({ ok: true });
  }
);

export default router;
