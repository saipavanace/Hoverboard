import { db } from '../db.js';
import { getBuiltinAdminEmail, getBuiltinLoginUsername } from './builtinAdmin.js';

/**
 * Normalize and validate a login username (distinct from email).
 * Lowercase [a-z0-9._-], first character alphanumeric, max 64 chars.
 */
export function normalizeUsername(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return { ok: false, error: 'required' };
  if (s.length > 64) return { ok: false, error: 'too long' };
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(s)) return { ok: false, error: 'invalid' };
  return { ok: true, value: s };
}

export function isReservedUsername(u) {
  return u === getBuiltinLoginUsername();
}

/** Resolve local password login: built-in alias, email (contains @), or username. */
export function findUserByLocalLogin(rawLogin) {
  const s = String(rawLogin || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === getBuiltinLoginUsername()) {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).get(getBuiltinAdminEmail());
  }
  if (s.includes('@')) {
    return db.prepare(`SELECT * FROM users WHERE email = ?`).get(lower);
  }
  return db.prepare(`SELECT * FROM users WHERE username = ?`).get(lower);
}
