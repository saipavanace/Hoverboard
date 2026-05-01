import { db } from '../db.js';
import { appendAuditEvent } from './auditEvents.js';

function defaultProjectId() {
  const row = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  return row?.id ?? 1;
}

function resolveManagerUserId(managerEmail) {
  if (!managerEmail) return null;
  const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(String(managerEmail).trim().toLowerCase());
  return row?.id ?? null;
}

/**
 * Apply configured group → role mappings (additive INSERT OR IGNORE).
 */
export function applyRoleMappings(userId, groups, cfg) {
  const mappings = cfg.auth?.roleMappings || [];
  if (!mappings.length || !groups?.length) return;
  const lower = new Set(groups.map((g) => String(g).toLowerCase()));
  for (const m of mappings) {
    const key = String(m.providerGroup || m.provider_group || '').toLowerCase();
    if (!key || !lower.has(key)) continue;
    const gRole = m.globalRole || m.global_role;
    const pRole = m.projectRole || m.project_role;
    const pId = m.projectId ?? m.project_id;
    if (gRole) {
      db.prepare(`INSERT OR IGNORE INTO user_global_roles (user_id, role) VALUES (?, ?)`).run(userId, gRole);
    }
    if (pRole != null && pId != null) {
      db.prepare(`INSERT OR IGNORE INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, ?)`).run(
        userId,
        Number(pId),
        pRole
      );
    }
  }
}

export function replaceSyncedGroups(userId, provider, groups) {
  db.prepare(`DELETE FROM user_synced_groups WHERE user_id = ? AND provider = ?`).run(userId, provider);
  const ins = db.prepare(
    `INSERT INTO user_synced_groups (user_id, provider, group_name, synced_at) VALUES (?, ?, ?, datetime('now'))`
  );
  for (const g of groups || []) {
    ins.run(userId, provider, String(g));
  }
}

export function syncProfileAttributes(userId, profile, cfg) {
  if (!cfg.auth?.syncProfileOnLogin) return;
  const override = cfg.auth?.allowManualProfileOverride !== false;
  const row = db.prepare(`SELECT department, job_title, display_name FROM users WHERE id = ?`).get(userId);
  if (!row) return;

  const sets = [];
  const vals = [];
  if (profile.display_name && (override || !row.display_name)) {
    sets.push('display_name = ?');
    vals.push(profile.display_name);
  }
  if (profile.department !== undefined && (override || !row.department)) {
    sets.push('department = ?');
    vals.push(profile.department || null);
  }
  if (profile.title !== undefined && (override || !row.job_title)) {
    sets.push('job_title = ?');
    vals.push(profile.title || null);
  }
  const mid = resolveManagerUserId(profile.manager_email);
  if (mid && override) {
    sets.push('manager_user_id = ?');
    vals.push(mid);
  }
  if (!sets.length) return;
  vals.push(userId);
  db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
}

/**
 * Find or create user from normalized profile. LDAP/OIDC specific auto-create flags in cfg.auth.*
 */
export function resolveOrCreateUser(profile, cfg) {
  const email = String(profile.email || '').trim().toLowerCase();
  const issuer = profile.providerIssuer || '';
  const sub = profile.providerSubject || '';

  if (issuer && sub) {
    const byLink = db.prepare(`SELECT * FROM users WHERE provider_issuer = ? AND provider_subject = ?`).get(issuer, sub);
    if (byLink) return byLink;
  }

  if (email && cfg.auth?.linkExistingUserByEmail !== false) {
    const byEmail = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (byEmail) {
      if (issuer && sub) {
        db.prepare(
          `UPDATE users SET provider_issuer = ?, provider_subject = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(issuer, sub, byEmail.id);
      }
      return db.prepare(`SELECT * FROM users WHERE id = ?`).get(byEmail.id);
    }
  }

  let autoCreate = false;
  if (profile.provider === 'ldap') {
    autoCreate = cfg.auth?.ldap?.autoCreateUsers !== false;
  } else if (profile.provider === 'oidc') {
    autoCreate = cfg.auth?.oidc?.autoCreateUsers !== false;
  }

  if (!autoCreate) return null;

  const ins = db
    .prepare(
      `
    INSERT INTO users (email, display_name, provider_subject, provider_issuer, department, job_title, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    RETURNING id
  `
    )
    .get(
      email,
      profile.display_name || email.split('@')[0],
      sub || null,
      issuer || null,
      profile.department || null,
      profile.title || null
    );

  const pid = defaultProjectId();
  const defaultRole = cfg.auth?.defaultProjectRole || 'engineer';
  db.prepare(`INSERT INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, ?)`).run(ins.id, pid, defaultRole);

  appendAuditEvent({
    actorUserId: ins.id,
    action: `USER_${profile.provider.toUpperCase()}_CREATE`,
    entityType: 'USER',
    entityId: String(ins.id),
    detail: { email },
    mirrorLegacy: true,
  });

  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(ins.id);
}

export function postLoginProvision(userId, profile, cfg) {
  syncProfileAttributes(userId, profile, cfg);
  replaceSyncedGroups(userId, profile.provider, profile.groups || []);
  applyRoleMappings(userId, profile.groups || [], cfg);
}
