let activeProjectId = null;

/** Called by ProjectProvider; keeps API calls scoped to the selected project. */
export function setActiveProjectId(id) {
  activeProjectId = id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
}

export function getActiveProjectId() {
  return activeProjectId;
}

function projectHeaders(extra = {}) {
  const h = { ...extra };
  if (activeProjectId != null) h['X-Project-Id'] = String(activeProjectId);
  return h;
}

const json = async (path, opts = {}) => {
  const baseHeaders =
    opts.body instanceof FormData ? projectHeaders({ ...opts.headers }) : projectHeaders({ 'Content-Type': 'application/json', ...opts.headers });
  // Do not `...opts` into fetch: a caller `headers` would replace this object and drop
  // Content-Type — Express then skips JSON parse and req.body stays {}.
  const { headers: _omitHeaders, ...rest } = opts;
  const r = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: baseHeaders,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const e = new Error(err.error || r.statusText);
    e.status = r.status;
    throw e;
  }
  return r.json();
};

function qsp(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : '';
}

export const api = {
  health: () => json('/api/health'),
  config: () => json('/api/config'),
  saveConfig: (body) => json('/api/config', { method: 'PUT', body: JSON.stringify(body) }),
  testNotificationEmail: (to) =>
    json('/api/notifications/test-email', { method: 'POST', body: JSON.stringify({ to }) }),
  specs: (params) => json(`/api/specs${qsp(params)}`),
  createSpec: (body) => json('/api/specs', { method: 'POST', body: JSON.stringify(body) }),
  deleteSpec: (id) => json(`/api/specs/${id}`, { method: 'DELETE' }),
  drPeek: () => json('/api/drs/peek'),
  uploadVersion: async (specId, version, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('version', version);
    const r = await fetch(`/api/specs/${specId}/versions`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: projectHeaders(),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  specVersion: (vid) => json(`/api/spec-versions/${vid}`),
  specVersionHtml: (vid) => json(`/api/spec-versions/${vid}/html`),
  drs: (params) => json(`/api/drs${qsp(params)}`),
  createDr: (body) => json('/api/drs', { method: 'POST', body: JSON.stringify(body) }),
  deleteDr: (publicId, params) =>
    json(`/api/drs/${encodeURIComponent(publicId)}${qsp(params || {})}`, { method: 'DELETE' }),
  vrs: (params) => json(`/api/vrs${qsp(params)}`),
  createVr: (body) => json('/api/vrs', { method: 'POST', body: JSON.stringify(body) }),
  patchVr: (publicId, body) =>
    json(`/api/vrs/${publicId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteVr: (publicId) =>
    json(`/api/vrs/${encodeURIComponent(publicId)}`, { method: 'DELETE' }),
  metrics: () => json('/api/metrics'),
  releaseReadiness: () => json('/api/release-readiness'),
  signatures: (params) => json(`/api/regressions/signatures${qsp(params || {})}`),
  signatureDetail: (key) =>
    json(`/api/regressions/signatures/${encodeURIComponent(key)}`),
  ingestRegressions: (body) =>
    json('/api/regressions/ingest', { method: 'POST', body: JSON.stringify(body) }),
  scanRegressionPaths: () => json('/api/regressions/scan-paths', { method: 'POST' }),
  ingestRegressionDir: (path) =>
    json('/api/regressions/ingest-directory', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  /** Multipart: append files as `logs`, optional `zip`; same binning as ingest-directory */
  ingestRegressionUpload: (formData) =>
    json('/api/regressions/ingest-upload', { method: 'POST', body: formData }),
  ingestCoverageDir: (path, runId) =>
    json('/api/coverage/ingest-directory', {
      method: 'POST',
      body: JSON.stringify({ path, runId }),
    }),
  ingestCoverageUpload: (formData) =>
    json('/api/coverage/ingest-upload', { method: 'POST', body: formData }),
  scanVrCoverageDir: (path, strictUvmInfo = true) =>
    json('/api/vr-coverage/scan-directory', {
      method: 'POST',
      body: JSON.stringify({ path, strictUvmInfo }),
    }),
  scanRequirementLogsUpload: (formData) =>
    json('/api/vr-coverage/scan-upload', { method: 'POST', body: formData }),
  coverageSummary: () => json('/api/coverage/summary'),
  vrCoverage: () => json('/api/vr-coverage'),
  drCoverage: () => json('/api/dr-coverage'),
  isoAudit: () => json('/api/iso/audit-log'),
  /** CSV export; requires same session + X-Project-Id as other project APIs. */
  isoTraceabilityCsv: async () => {
    const r = await fetch('/api/iso/traceability.csv', {
      credentials: 'include',
      headers: projectHeaders(),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const e = new Error(err.error || r.statusText);
      e.status = r.status;
      throw e;
    }
    return r.blob();
  },
  demoSeed: () => json('/api/demo/seed', { method: 'POST' }),

  authMe: () => json('/api/auth/me'),
  authLogin: (body) => json('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  authLdapLogin: (body) =>
    json('/api/auth/ldap/login', { method: 'POST', body: JSON.stringify(body) }),
  authLogout: () => json('/api/auth/logout', { method: 'POST' }),
  authBootstrap: (body) =>
    json('/api/auth/bootstrap-first-admin', { method: 'POST', body: JSON.stringify(body) }),

  projects: () => json('/api/projects'),
  project: (projectId) => json(`/api/projects/${projectId}`),
  createProject: (body) =>
    json('/api/projects', { method: 'POST', body: JSON.stringify(body) }),

  artifactDetail: (artifactId) => json(`/api/graph/artifacts/${artifactId}`),

  artifactLookup: (publicId, type) =>
    json(`/api/graph/artifacts/lookup${qsp({ public_id: publicId, type })}`),
  artifactComments: (artifactId) => json(`/api/graph/artifacts/${artifactId}/comments`),
  postComment: (artifactId, body, parentId) =>
    json(`/api/graph/artifacts/${artifactId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_comment_id: parentId }),
    }),
  resolveComment: (commentId, resolved) =>
    json(`/api/graph/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolved }),
    }),
  approvals: (artifactId) => json(`/api/graph/artifacts/${artifactId}/approvals`),
  postApproval: (artifactId, decision) =>
    json(`/api/graph/artifacts/${artifactId}/approvals`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  adminUsers: () => json('/api/admin/users'),
  adminCreateUser: (body) =>
    json('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  adminAuthOverview: () => json('/api/admin/auth-overview'),
  adminSyncedGroups: () => json('/api/admin/synced-groups'),
  adminPatchUser: (id, body) =>
    json(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminRoles: (id, body) =>
    json(`/api/admin/users/${id}/roles`, { method: 'POST', body: JSON.stringify(body) }),
  adminAudit: (limit) => json(`/api/admin/audit-events${qsp({ limit })}`),
  adminBaselines: () => json('/api/admin/baselines'),
  adminCreateBaseline: (body) =>
    json('/api/admin/baselines', { method: 'POST', body: JSON.stringify(body) }),
  adminBaselineExport: (id) => json(`/api/admin/baselines/${id}/export`),
  adminSignoffRules: () => json('/api/admin/signoff-rules'),
  adminCreateSignoffRule: (body) =>
    json('/api/admin/signoff-rules', { method: 'POST', body: JSON.stringify(body) }),

  /** System admin: read-only full DB mirror JSON (live from SQLite + computed metrics). */
  adminFullSnapshot: () => json('/api/admin/full-snapshot'),

  teams: (projectId) => json(`/api/projects/${projectId}/teams`),
  createTeam: (projectId, body) =>
    json(`/api/projects/${projectId}/teams`, { method: 'POST', body: JSON.stringify(body) }),
  patchTeam: (projectId, teamId, body) =>
    json(`/api/projects/${projectId}/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  evidenceList: (projectId, params) =>
    json(`/api/projects/${projectId}/evidence${qsp(params || {})}`),
  evidenceUpload: async (projectId, formData) => {
    const r = await fetch(`/api/projects/${projectId}/evidence/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: projectHeaders(),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  evidencePatch: (projectId, evidenceId, body) =>
    json(`/api/projects/${projectId}/evidence/${evidenceId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  evidenceDownloadUrl: (projectId, evidenceId) =>
    `/api/projects/${projectId}/evidence/${evidenceId}/download`,
};
