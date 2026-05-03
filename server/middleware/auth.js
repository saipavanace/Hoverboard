import { db } from '../db.js';
import { loadConfig } from '../config.js';

const PUBLIC_PREFIXES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/ldap',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/callback',
  '/api/auth/oidc',
  '/api/auth/bootstrap-first-admin',
  '/api/config',
];

function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

export function authDisabled() {
  const cfg = loadConfig();
  if (cfg.auth?.disabled === true) return true;
  if (process.env.HOVERBOARD_AUTH_DISABLED === 'true') return true;
  return false;
}

function systemUserId() {
  const row = db.prepare(`SELECT id FROM users WHERE email = 'system@hoverboard.internal'`).get();
  return row?.id ?? null;
}

export function attachAuth(req, res, next) {
  req.authUser = null;

  if (authDisabled()) {
    req.authUser = {
      id: systemUserId(),
      email: 'system@hoverboard.internal',
      display_name: 'Local (auth disabled)',
      enabled: true,
      global_roles: ['system_admin'],
      project_roles: {},
      authDisabled: true,
    };
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.hb_session;
  if (!sid) return next();

  const sess = db
    .prepare(
      `
    SELECT s.user_id, u.email, u.display_name, u.enabled
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now')
  `
    )
    .get(sid);

  if (!sess || !sess.enabled) return next();

  const globals = db
    .prepare(`SELECT role FROM user_global_roles WHERE user_id = ?`)
    .all(sess.user_id)
    .map((r) => r.role);

  const projects = db.prepare(`SELECT project_id, role FROM user_project_roles WHERE user_id = ?`).all(sess.user_id);

  const project_roles = {};
  for (const p of projects) {
    if (!project_roles[p.project_id]) project_roles[p.project_id] = [];
    project_roles[p.project_id].push(p.role);
  }

  req.authUser = {
    id: sess.user_id,
    email: sess.email,
    display_name: sess.display_name,
    enabled: Boolean(sess.enabled),
    global_roles: globals,
    project_roles,
    sessionId: sid,
    authDisabled: false,
  };
  return next();
}

const SESSION_HINT =
  'Session cookie missing on this request (often localhost vs 127.0.0.1, or UI/API on different hosts without one reverse-proxy origin). Sign in again using the same URL you use for the app.';

export function requireLogin(req, res, next) {
  if (authDisabled()) return next();
  if (!req.authUser?.id) {
    return res.status(401).json({ error: 'authentication required', hint: SESSION_HINT });
  }
  return next();
}

function isPublicPath(urlPath) {
  return PUBLIC_PREFIXES.some((p) => urlPath === p || urlPath.startsWith(p + '/') || urlPath.startsWith(p + '?'));
}

/** Gate API when auth is enabled; allow public routes */
export function requireApiAuth(req, res, next) {
  if (authDisabled()) return next();
  const pathname = (req.originalUrl || req.url || '').split('?')[0];
  if (isPublicPath(pathname)) return next();
  if (!req.authUser?.id) {
    return res.status(401).json({ error: 'authentication required', hint: SESSION_HINT });
  }
  return next();
}

export function setSessionCookie(res, sessionId, maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production';
  const parts = [
    `hb_session=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production';
  const parts = ['hb_session=deleted', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
