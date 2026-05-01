/**
 * Central reference: HTTP routes and the project permission keys that guard them.
 * Handlers may derive project_id from params, body, or related entities — see middleware usage.
 */
export const ROUTE_PERMISSION_MAP = [
  ['GET /api/projects', '(authenticated) lists accessible projects'],
  ['GET /api/specs', 'specs_read (+ list scope)'],
  ['POST /api/specs', 'specs_write'],
  ['GET /api/drs', 'drs_read (+ list scope)'],
  ['POST /api/drs', 'drs_write'],
  ['GET /api/vrs', 'vrs_read (+ list scope)'],
  ['POST /api/vrs', 'vrs_write'],
  ['GET /api/graph/artifacts/:id', 'specs_read'],
  ['GET /api/graph/artifacts/:id/comments', 'specs_read'],
  ['POST /api/graph/artifacts/:id/comments', 'comments_write'],
  ['PATCH /api/graph/comments/:id', 'comments_write'],
  ['GET /api/graph/artifacts/:id/approvals', 'specs_read'],
  ['POST /api/graph/artifacts/:id/approvals', 'approvals_act'],
  ['POST /api/projects/:projectId/evidence/upload', 'evidence_write'],
  ['GET /api/projects/:projectId/evidence', 'evidence_read'],
  ['PATCH /api/projects/:projectId/evidence/:id', 'evidence_write'],
  ['GET /api/projects/:projectId/teams', 'admin_teams'],
  ['POST /api/projects/:projectId/teams', 'admin_teams'],
  ['PATCH /api/projects/:projectId/teams/:id', 'admin_teams'],
  ['GET /api/admin/users', 'system_admin (or auth disabled)'],
  ['PATCH /api/admin/users/:id', 'system_admin (or auth disabled)'],
];
