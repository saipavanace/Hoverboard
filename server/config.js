import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const configPath =
  process.env.HOVERBOARD_CONFIG ||
  path.join(rootDir, 'hoverboard.config.json');

const defaults = {
  projectName: 'Hoverboard',
  companyName: 'Your org',
  requirementCategories: [
    'System',
    'CHI',
    'IOAIU',
    'DVE',
    'DCE',
    'GIU',
    'DMI',
    'DII',
  ],
  regressionRoots: ['./sample-regressions'],
  releaseMetricWeights: {
    passRate: 0.25,
    functionalCov: 0.2,
    codeCov: 0.15,
    vrCov: 0.15,
    drClosure: 0.25,
  },
  branding: {
    accent: '#0d9488',
    logoUrl: null,
  },
  regressionParsers: [
    { name: 'fail', regex: 'FAIL\\b' },
    { name: 'error', regex: 'ERROR\\b' },
    { name: 'assert', regex: 'ASSERT' },
    { name: 'timeout', regex: 'timeout' },
    { name: 'fatal', regex: 'UVM_FATAL' },
  ],
  coverageRegex: {
    functional: [
      'functional\\s*coverage\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
      '\\bfcov\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
    ],
    code: [
      'code\\s*coverage\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
      '\\bccov\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%?',
    ],
  },
  vrLogRegex:
    '(?:UVM_INFO|uvm_info|UVM_NOTE)[\\s\\S]{0,200}?\\b((?:VR|SR|CR|AR)[-_]\\d{1,8})\\b',
  /**
   * When true, enable /api/iso/* and show the ISO 26262 workspace + project Audit nav. Default false (opt-in).
   */
  iso26262Enabled: false,
  auth: {
    /** When false, users must sign in. Set HOVERBOARD_AUTH_DISABLED=true for local dev without login. */
    disabled: false,
    sessionTtlHours: 336,
    localLoginEnabled: true,
    /** Set true in production to reject password login except recovery (optional enforcement in routes). */
    localLoginDisabledInProduction: false,
    /** After OIDC login, browser redirects here (SPA origin), e.g. http://localhost:5173 */
    publicAppUrl: 'http://localhost:5173',
    defaultProjectRole: 'engineer',
    /** When true, OIDC/LDAP updates display name, department, job title on each login (subject to allowManualProfileOverride). */
    syncProfileOnLogin: true,
    /** If false, empty DB fields are not overwritten by IdP on login. */
    allowManualProfileOverride: true,
    /** Match existing local user by email and attach provider ids (SSO linking). */
    linkExistingUserByEmail: true,
    /**
     * Map directory / IdP group names to Hoverboard roles (additive).
     * Example: { "providerGroup": "hoverboard-admins", "globalRole": "system_admin" }
     * Or: { "providerGroup": "dv-reviewers", "projectId": 1, "projectRole": "reviewer" }
     */
    roleMappings: [],
    /**
     * Local break-glass administrator (username/password). Password also via HOVERBOARD_BUILTIN_ADMIN_PASSWORD.
     * Empty password in file falls back to default "12345" until set.
     */
    builtinAdmin: {
      email: 'admin@hoverboard.builtin',
      username: 'admin',
      password: '',
    },
    oidc: {
      issuerUrl: '',
      clientId: '',
      clientSecret: '',
      redirectUri: 'http://localhost:5179/api/auth/callback',
      scopes: ['openid', 'profile', 'email'],
      allowedDomains: [],
      autoCreateUsers: true,
      /** Claim paths to treat as group lists (first match wins). */
      groupsClaimPaths: ['groups', 'roles'],
    },
    ldap: {
      enabled: false,
      url: '',
      bindDn: '',
      bindPassword: '',
      searchBase: '',
      userSearchFilter: '(|(sAMAccountName={{username}})(uid={{username}})(mail={{username}}))',
      userAttributeList: 'mail,cn,department,title,memberOf',
      emailAttribute: 'mail',
      displayNameAttribute: 'cn',
      departmentAttribute: 'department',
      titleAttribute: 'title',
      groupAttribute: 'memberOf',
      autoCreateUsers: true,
      tlsRejectUnauthorized: true,
    },
  },
};

export function loadConfig() {
  let file = {};
  try {
    if (fs.existsSync(configPath)) {
      file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return {
    ...defaults,
    ...file,
    requirementCategories: file.requirementCategories ?? defaults.requirementCategories,
    regressionRoots: file.regressionRoots ?? defaults.regressionRoots,
    regressionParsers: file.regressionParsers ?? defaults.regressionParsers,
    coverageRegex: { ...defaults.coverageRegex, ...(file.coverageRegex || {}) },
    vrLogRegex: file.vrLogRegex ?? defaults.vrLogRegex,
    releaseMetricWeights: {
      ...defaults.releaseMetricWeights,
      ...(file.releaseMetricWeights || {}),
    },
    branding: { ...defaults.branding, ...(file.branding || {}) },
    auth: {
      ...defaults.auth,
      ...(file.auth || {}),
      oidc: { ...defaults.auth.oidc, ...(file.auth?.oidc || {}) },
      ldap: { ...defaults.auth.ldap, ...(file.auth?.ldap || {}) },
      builtinAdmin: {
        ...defaults.auth.builtinAdmin,
        ...(file.auth?.builtinAdmin || {}),
      },
    },
  };
}

function readRawConfigFile() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return {};
}

/** Remove secrets before returning config to clients (GET/PUT API). */
export function sanitizeConfigForPublic(cfg) {
  const out = JSON.parse(JSON.stringify(cfg));
  if (out.auth?.builtinAdmin) {
    out.auth.builtinAdmin = { ...out.auth.builtinAdmin };
    delete out.auth.builtinAdmin.password;
  }
  return out;
}

function mergeBuiltinAdminForSave(raw, current, partial) {
  const incPwd = partial.auth?.builtinAdmin?.password;
  const password =
    incPwd != null && String(incPwd).trim() !== ''
      ? String(incPwd)
      : raw.auth?.builtinAdmin?.password ?? '';
  return {
    ...defaults.auth.builtinAdmin,
    ...(current.auth?.builtinAdmin || {}),
    ...(partial.auth?.builtinAdmin || {}),
    password,
  };
}

export function saveConfig(partial) {
  const raw = readRawConfigFile();
  const current = loadConfig();
  const next = {
    ...current,
    ...partial,
    requirementCategories: partial.requirementCategories ?? current.requirementCategories,
    releaseMetricWeights: {
      ...current.releaseMetricWeights,
      ...(partial.releaseMetricWeights || {}),
    },
    branding: { ...current.branding, ...(partial.branding || {}) },
    auth: partial.auth
      ? {
          ...current.auth,
          ...partial.auth,
          oidc: { ...current.auth.oidc, ...(partial.auth.oidc || {}) },
          ldap: { ...current.auth.ldap, ...(partial.auth.ldap || {}) },
          builtinAdmin: mergeBuiltinAdminForSave(raw, current, partial),
        }
      : current.auth,
  };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export { configPath };
