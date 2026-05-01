import { db } from '../db.js';
import { loadConfig } from '../config.js';
import { hashPassword } from './password.js';

/** Legacy default email; row is migrated to `auth.builtinAdmin.email` on startup. */
export const BUILTIN_ADMIN_EMAIL = 'admin@hoverboard.builtin';
export const LEGACY_BUILTIN_EMAIL = BUILTIN_ADMIN_EMAIL;

export function getBuiltinAdminEmail() {
  const cfg = loadConfig();
  const em = cfg.auth?.builtinAdmin?.email;
  if (em != null && String(em).trim() !== '') {
    return String(em).trim().toLowerCase();
  }
  return BUILTIN_ADMIN_EMAIL;
}

export function getBuiltinLoginUsername() {
  const cfg = loadConfig();
  const u = cfg.auth?.builtinAdmin?.username;
  if (u != null && String(u).trim() !== '') {
    return String(u).trim().toLowerCase();
  }
  return 'admin';
}

export function resolveLoginIdentifier(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (e === getBuiltinLoginUsername()) {
    return getBuiltinAdminEmail();
  }
  return e;
}

export function isBuiltinAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === getBuiltinAdminEmail();
}

function effectiveBuiltinPassword() {
  if (process.env.HOVERBOARD_BUILTIN_ADMIN_PASSWORD) {
    return String(process.env.HOVERBOARD_BUILTIN_ADMIN_PASSWORD);
  }
  const cfg = loadConfig();
  const p = cfg.auth?.builtinAdmin?.password;
  if (p != null && String(p).trim() !== '') {
    return String(p);
  }
  return '12345';
}

/**
 * Ensures the built-in admin user exists. Email and login username come from config;
 * password from env, then config file, then default "12345".
 * Migrates a row from the legacy default email when the configured email changes.
 */
export function ensureBuiltinAdmin() {
  const email = getBuiltinAdminEmail();
  const legacy = BUILTIN_ADMIN_EMAIL;
  const hash = hashPassword(effectiveBuiltinPassword());
  const defaultProject = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();

  if (email !== legacy) {
    const leg = db.prepare(`SELECT id FROM users WHERE email = ?`).get(legacy);
    const atNew = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (leg && !atNew) {
      db.prepare(`UPDATE users SET email = ? WHERE id = ?`).run(email, leg.id);
    }
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (!existing) {
    const ins = db
      .prepare(
        `INSERT INTO users (email, display_name, password_hash, enabled)
         VALUES (?, 'admin', ?, 1)
         RETURNING id`
      )
      .get(email, hash);
    db.prepare(`INSERT INTO user_global_roles (user_id, role) VALUES (?, 'system_admin')`).run(ins.id);
    if (defaultProject?.id) {
      db.prepare(
        `INSERT OR IGNORE INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, 'project_admin')`
      ).run(ins.id, defaultProject.id);
    }
    return;
  }

  db.prepare(`UPDATE users SET password_hash = ?, enabled = 1 WHERE email = ?`).run(hash, email);
  if (defaultProject?.id) {
    db.prepare(
      `INSERT OR IGNORE INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, 'project_admin')`
    ).run(existing.id, defaultProject.id);
  }
}
