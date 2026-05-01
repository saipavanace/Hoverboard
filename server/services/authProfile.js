/**
 * Normalized profile from any auth provider (OIDC, LDAP, local). Core auth logic
 * only consumes this shape — provider-specific code maps into it.
 *
 * @typedef {Object} NormalizedAuthProfile
 * @property {string} provider - e.g. 'oidc', 'ldap', 'local'
 * @property {string} providerSubject - stable id from provider (sub, objectGuid, etc.)
 * @property {string} [providerIssuer] - OIDC issuer URL or LDAP server id
 * @property {string} email
 * @property {string} display_name
 * @property {string[]} [groups] - group / role names for role mapping
 * @property {string} [department]
 * @property {string} [title]
 * @property {string} [manager_email] - if resolvable; else null
 */

function asArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v ? [v] : [];
  return [];
}

/**
 * Read first non-empty nested path (e.g. "groups" or custom claim).
 */
function getClaim(claims, path) {
  if (!path || !claims) return undefined;
  if (!path.includes('.')) return claims[path];
  const parts = path.split('.');
  let cur = claims;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Extract group-like claim from OIDC id_token / userinfo using config paths.
 */
export function extractOidcGroups(claims, oidcConfig = {}) {
  const paths = oidcConfig.groupsClaimPaths || [
    'groups',
    'roles',
    'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
  ];
  for (const p of paths) {
    const v = getClaim(claims, p) ?? claims[p];
    const arr = asArray(v);
    if (arr.length) return arr;
  }
  return [];
}

/**
 * @param {Record<string, unknown>} claims
 * @param {string} issuerUrl
 * @param {object} [oidcSection] auth.oidc slice (groupsClaimPaths, etc.)
 */
export function oidcClaimsToProfile(claims, issuerUrl, oidcSection = {}) {
  const email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
  const sub = String(claims.sub || '').trim();
  const display_name =
    String(claims.name || claims.given_name || claims.family_name || email || 'User').trim() || 'User';
  const department = claims.department ? String(claims.department) : undefined;
  const title = claims.job_title || claims.title ? String(claims.job_title || claims.title) : undefined;
  const groups = extractOidcGroups(claims, oidcSection);
  return {
    provider: 'oidc',
    providerSubject: sub,
    providerIssuer: issuerUrl,
    email,
    display_name,
    groups,
    department,
    title,
    manager_email: claims.manager_email ? String(claims.manager_email).toLowerCase() : undefined,
  };
}
