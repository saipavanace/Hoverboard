import { Router } from 'express';
import { randomUUID } from 'crypto';
import * as client from 'openid-client';
import { db } from '../db.js';
import { loadConfig } from '../config.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { isBuiltinAdminEmail } from '../services/builtinAdmin.js';
import { findUserByLocalLogin, normalizeUsername, isReservedUsername } from '../services/username.js';
import { appendAuditEvent } from '../services/auditEvents.js';
import {
  authDisabled,
  clearSessionCookie,
  setSessionCookie,
  attachAuth,
} from '../middleware/auth.js';
import { oidcClaimsToProfile } from '../services/authProfile.js';
import { resolveOrCreateUser, postLoginProvision } from '../services/authProvisioning.js';
import { ldapAuthenticate } from '../services/providers/ldapAuth.js';

const router = Router();

function jwtPayload(idToken) {
  try {
    const p = idToken.split('.')[1];
    return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function sessionTtlMs() {
  const cfg = loadConfig();
  const h = cfg.auth?.sessionTtlHours ?? 336;
  return h * 3600 * 1000;
}

function createSession(userId, ip) {
  const id = randomUUID();
  const ttl = sessionTtlMs();
  const mod = `+${Math.floor(ttl / 1000)} seconds`;
  db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`).run(
    id,
    userId,
    mod
  );
  appendAuditEvent({ actorUserId: userId, action: 'LOGIN', entityType: 'USER', entityId: String(userId), detail: { ip }, mirrorLegacy: true });
  return { id, ttl };
}

router.get('/me', (req, res) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'not authenticated', user: null });
  }
  res.json({
    user: {
      id: req.authUser.id,
      email: req.authUser.email,
      display_name: req.authUser.display_name,
      global_roles: req.authUser.global_roles,
      project_roles: req.authUser.project_roles,
      authDisabled: req.authUser.authDisabled,
    },
  });
});

router.post('/bootstrap-first-admin', (req, res) => {
  if (authDisabled()) {
    return res.status(400).json({ error: 'auth is disabled; bootstrap not needed' });
  }
  const n = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  if (n > 0) {
    return res.status(403).json({ error: 'bootstrap already completed' });
  }
  const { email, password, display_name, username: usernameIn } = req.body || {};
  if (!email || !password || !display_name) {
    return res.status(400).json({ error: 'email, password, display_name required' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (isBuiltinAdminEmail(normalizedEmail)) {
    return res.status(403).json({ error: 'reserved email' });
  }
  const usernameRaw =
    usernameIn != null && String(usernameIn).trim() !== '' ? String(usernameIn) : normalizedEmail.split('@')[0];
  const nu = normalizeUsername(usernameRaw);
  if (!nu.ok) {
    return res.status(400).json({ error: 'invalid username' });
  }
  if (isReservedUsername(nu.value)) {
    return res.status(400).json({ error: 'reserved username' });
  }
  if (db.prepare(`SELECT id FROM users WHERE username = ?`).get(nu.value)) {
    return res.status(409).json({ error: 'username exists' });
  }
  const hash = hashPassword(password);
  const ins = db
    .prepare(
      `
    INSERT INTO users (email, display_name, username, password_hash, enabled)
    VALUES (?, ?, ?, ?, 1)
    RETURNING id
  `
    )
    .get(normalizedEmail, String(display_name).trim(), nu.value, hash);

  db.prepare(`INSERT INTO user_global_roles (user_id, role) VALUES (?, 'system_admin')`).run(ins.id);

  const prow = db.prepare(`SELECT id FROM projects WHERE slug = 'default'`).get();
  if (!prow) return res.status(500).json({ error: 'default project missing' });
  db.prepare(`INSERT INTO user_project_roles (user_id, project_id, role) VALUES (?, ?, 'project_admin')`).run(
    ins.id,
    prow.id
  );

  appendAuditEvent({
    actorUserId: ins.id,
    action: 'BOOTSTRAP_ADMIN',
    entityType: 'USER',
    entityId: String(ins.id),
    detail: { email },
    mirrorLegacy: true,
  });

  const sess = createSession(ins.id, req.ip);
  setSessionCookie(res, sess.id, sess.ttl);
  res.status(201).json({ ok: true, userId: ins.id });
});

router.post('/login', (req, res) => {
  if (authDisabled()) {
    return res.status(400).json({ error: 'local login not available while auth is disabled' });
  }
  const cfg = loadConfig();
  if (process.env.NODE_ENV === 'production' && cfg.auth?.localLoginDisabledInProduction) {
    return res.status(403).json({ error: 'local login disabled in production' });
  }
  if (!cfg.auth?.localLoginEnabled) {
    return res.status(403).json({ error: 'local login disabled' });
  }
  const rawLogin = req.body?.email ?? req.body?.username;
  const { password } = req.body || {};
  if (!rawLogin || !password) return res.status(400).json({ error: 'email or username and password required' });

  const user = findUserByLocalLogin(String(rawLogin).trim());
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    appendAuditEvent({
      actorUserId: null,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: String(rawLogin),
      detail: { ip: req.ip },
      mirrorLegacy: true,
    });
    return res.status(401).json({ error: 'invalid credentials' });
  }
  if (!user.enabled) return res.status(403).json({ error: 'account disabled' });

  const sess = createSession(user.id, req.ip);
  setSessionCookie(res, sess.id, sess.ttl);
  res.json({ ok: true });
});

router.post('/logout', attachAuth, (req, res) => {
  const cookies = req.headers.cookie || '';
  const m = cookies.match(/hb_session=([^;]+)/);
  if (m) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(decodeURIComponent(m[1]));
  }
  if (req.authUser?.id) {
    appendAuditEvent({
      actorUserId: req.authUser.id,
      action: 'LOGOUT',
      entityType: 'USER',
      entityId: String(req.authUser.id),
      detail: {},
      mirrorLegacy: true,
    });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

let oidcConfiguration = null;
let oidcIssuerKey = '';

async function getOidcConfiguration() {
  const cfg = loadConfig();
  const oidc = cfg.auth?.oidc;
  if (!oidc?.issuerUrl || !oidc?.clientId || !oidc?.clientSecret || !oidc?.redirectUri) {
    return null;
  }
  const key = `${oidc.issuerUrl}|${oidc.clientId}`;
  if (oidcConfiguration && oidcIssuerKey === key) return { cfg, oidc, configuration: oidcConfiguration };
  const issuer = new URL(oidc.issuerUrl);
  const configuration = await client.discovery(
    issuer,
    oidc.clientId,
    { redirect_uris: [oidc.redirectUri] },
    client.ClientSecretPost(oidc.clientSecret)
  );
  oidcConfiguration = configuration;
  oidcIssuerKey = key;
  return { cfg, oidc, configuration };
}

router.get('/oidc/start', async (req, res) => {
  if (authDisabled()) {
    return res.status(400).send('OIDC not available while auth is disabled');
  }
  try {
    const pack = await getOidcConfiguration();
    if (!pack) return res.status(501).json({ error: 'OIDC not configured' });

    const scopes = (pack.oidc.scopes || ['openid', 'profile', 'email']).join(' ');
    const code_verifier = client.randomPKCECodeVerifier();
    const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
    const state = client.randomState();

    db.prepare(`INSERT INTO oauth_states (state, nonce) VALUES (?, ?)`).run(
      state,
      JSON.stringify({ code_verifier })
    );

    const redirectTo = client.buildAuthorizationUrl(pack.configuration, {
      redirect_uri: pack.oidc.redirectUri,
      scope: scopes,
      code_challenge,
      code_challenge_method: 'S256',
      state,
    });
    res.redirect(redirectTo.href);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get('/callback', async (req, res) => {
  if (authDisabled()) {
    return res.redirect('/');
  }
  try {
    const pack = await getOidcConfiguration();
    if (!pack) return res.status(501).send('OIDC not configured');

    const currentUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);
    const st = currentUrl.searchParams.get('state');
    const row = db.prepare(`SELECT * FROM oauth_states WHERE state = ?`).get(st);
    if (!row) {
      return res.status(400).send('invalid OAuth state');
    }
    db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(st);

    let code_verifier;
    try {
      const parsed = JSON.parse(row.nonce || '{}');
      code_verifier = parsed.code_verifier;
    } catch {
      code_verifier = undefined;
    }

    const tokens = await client.authorizationCodeGrant(pack.configuration, currentUrl, {
      pkceCodeVerifier: code_verifier,
      expectedState: st,
    });

    let claims = {};
    if (tokens.id_token) {
      claims = jwtPayload(tokens.id_token);
    }
    let userinfo = {};
    if (tokens.access_token) {
      try {
        userinfo = await client.fetchUserInfo(
          pack.configuration,
          tokens.access_token,
          client.skipSubjectCheck
        );
      } catch {
        /* ignore */
      }
    }
    const merged = { ...claims, ...userinfo };
    const profile = oidcClaimsToProfile(merged, pack.oidc.issuerUrl, pack.oidc);

    if (!profile.email || !profile.providerSubject) {
      return res.status(400).send('OIDC token did not include email/subject (check scopes: openid email profile)');
    }

    const domain = profile.email.split('@')[1]?.toLowerCase();
    const allowed = pack.oidc.allowedDomains || [];
    if (allowed.length && !allowed.includes(domain)) {
      return res.status(403).send(`email domain not allowed: ${domain}`);
    }

    const user = resolveOrCreateUser(profile, pack.cfg);
    if (!user) {
      return res.status(403).send('user not provisioned');
    }
    if (!user.enabled) return res.status(403).send('account disabled');

    postLoginProvision(user.id, profile, pack.cfg);

    const sess = createSession(user.id, req.ip);
    setSessionCookie(res, sess.id, sess.ttl);
    const cfg = loadConfig();
    const publicApp =
      process.env.HOVERBOARD_PUBLIC_APP_URL || cfg.auth?.publicAppUrl || 'http://localhost:5173';
    const base = String(publicApp).replace(/\/$/, '');
    res.redirect(`${base}/projects`);
  } catch (e) {
    res.status(500).send(String(e.message || e));
  }
});

/** LDAP bind + search (corporate directory). Body: { username, password } */
router.post('/ldap/login', async (req, res) => {
  if (authDisabled()) {
    return res.status(400).json({ error: 'LDAP not available while auth is disabled' });
  }
  const cfg = loadConfig();
  const ldapCfg = cfg.auth?.ldap;
  if (!ldapCfg?.enabled || !ldapCfg.url) {
    return res.status(501).json({ error: 'LDAP not configured' });
  }
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  try {
    const profile = await ldapAuthenticate(username, password, ldapCfg);
    const user = resolveOrCreateUser(profile, cfg);
    if (!user) {
      return res.status(403).json({ error: 'user not provisioned (enable auth.ldap.autoCreateUsers or create user first)' });
    }
    if (!user.enabled) return res.status(403).json({ error: 'account disabled' });
    postLoginProvision(user.id, profile, cfg);
    const sess = createSession(user.id, req.ip);
    setSessionCookie(res, sess.id, sess.ttl);
    res.json({ ok: true });
  } catch (e) {
    appendAuditEvent({
      actorUserId: null,
      action: 'LOGIN_FAILED',
      entityType: 'USER',
      entityId: String(username),
      detail: { ldap: true, message: String(e.message || e) },
      mirrorLegacy: true,
    });
    res.status(401).json({ error: 'ldap authentication failed' });
  }
});

export default router;
