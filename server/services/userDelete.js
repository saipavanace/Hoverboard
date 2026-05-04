import { db } from '../db.js';

const SYSTEM_EMAIL = 'system@hoverboard.internal';

export function getInternalSystemUserId() {
  const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(SYSTEM_EMAIL);
  return row?.id ?? null;
}

/**
 * Clear or reassign FK references so `DELETE FROM users` succeeds (SQLite RESTRICT on most user FKs).
 * Comments and approvals keep integrity by attributing to the internal system user where NOT NULL.
 */
export function reassignReferencesBeforeUserDelete(targetUserId, systemUserId) {
  if (!systemUserId) {
    throw new Error('Internal system user is required for reassignment');
  }
  if (targetUserId === systemUserId) {
    throw new Error('Cannot delete internal system user');
  }

  db.prepare(`UPDATE users SET manager_user_id = NULL WHERE manager_user_id = ?`).run(targetUserId);

  db.prepare(`UPDATE artifacts SET created_by_user_id = ? WHERE created_by_user_id = ?`).run(
    systemUserId,
    targetUserId
  );
  db.prepare(`UPDATE artifact_versions SET created_by_user_id = ? WHERE created_by_user_id = ?`).run(
    systemUserId,
    targetUserId
  );
  db.prepare(`UPDATE artifact_comments SET author_user_id = ? WHERE author_user_id = ?`).run(
    systemUserId,
    targetUserId
  );
  db.prepare(`UPDATE artifact_comments SET resolved_by_user_id = NULL WHERE resolved_by_user_id = ?`).run(
    targetUserId
  );
  db.prepare(`UPDATE artifact_approvals SET approved_by_user_id = ? WHERE approved_by_user_id = ?`).run(
    systemUserId,
    targetUserId
  );
  db.prepare(`UPDATE baselines SET created_by_user_id = NULL WHERE created_by_user_id = ?`).run(targetUserId);
  db.prepare(`UPDATE audit_events SET actor_user_id = NULL WHERE actor_user_id = ?`).run(targetUserId);

  try {
    db.prepare(`UPDATE evidence_files SET uploaded_by_user_id = NULL WHERE uploaded_by_user_id = ?`).run(
      targetUserId
    );
  } catch {
    /* older DBs without column */
  }
}
