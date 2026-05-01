import { db } from '../db.js';

/**
 * Append-only audit trail (production audit_events).
 * Also mirrors legacy audit_log for backward compatibility when mirrorLegacy is true.
 */
export function appendAuditEvent({
  actorUserId = null,
  action,
  entityType = null,
  entityId = null,
  detail = null,
  ip = null,
  mirrorLegacy = true,
}) {
  const detailJson = detail != null ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null;
  db.prepare(
    `
    INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, detail_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(actorUserId, action, entityType, entityId != null ? String(entityId) : null, detailJson, ip);

  if (mirrorLegacy) {
    const userLabel = actorUserId ? String(actorUserId) : 'system';
    db.prepare(
      `
      INSERT INTO audit_log (entity_type, entity_id, action, detail, user_label)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(entityType, entityId != null ? String(entityId) : '', action, detailJson, userLabel);
  }
}

export function queryAuditEvents({ limit = 500, offset = 0, action = null, entityType = null }) {
  let sql = `SELECT * FROM audit_events WHERE 1=1`;
  const params = [];
  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }
  if (entityType) {
    sql += ' AND entity_type = ?';
    params.push(entityType);
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}
