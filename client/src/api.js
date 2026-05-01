const json = async (path, opts = {}) => {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || r.statusText);
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
  specs: (params) => json(`/api/specs${qsp(params)}`),
  createSpec: (body) => json('/api/specs', { method: 'POST', body: JSON.stringify(body) }),
  deleteSpec: (id) => json(`/api/specs/${id}`, { method: 'DELETE' }),
  drPeek: () => json('/api/drs/peek'),
  uploadVersion: async (specId, version, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('version', version);
    const r = await fetch(`/api/specs/${specId}/versions`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  },
  specVersion: (vid) => json(`/api/spec-versions/${vid}`),
  specVersionHtml: (vid) => json(`/api/spec-versions/${vid}/html`),
  drs: (params) => json(`/api/drs${qsp(params)}`),
  createDr: (body) => json('/api/drs', { method: 'POST', body: JSON.stringify(body) }),
  vrs: (params) => json(`/api/vrs${qsp(params)}`),
  createVr: (body) => json('/api/vrs', { method: 'POST', body: JSON.stringify(body) }),
  patchVr: (publicId, body) =>
    json(`/api/vrs/${publicId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  metrics: () => json('/api/metrics'),
  releaseReadiness: () => json('/api/release-readiness'),
  signatures: () => json('/api/regressions/signatures'),
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
  ingestCoverageDir: (path, runId) =>
    json('/api/coverage/ingest-directory', {
      method: 'POST',
      body: JSON.stringify({ path, runId }),
    }),
  scanVrCoverageDir: (path, strictUvmInfo = true) =>
    json('/api/vr-coverage/scan-directory', {
      method: 'POST',
      body: JSON.stringify({ path, strictUvmInfo }),
    }),
  coverageSummary: () => json('/api/coverage/summary'),
  vrCoverage: () => json('/api/vr-coverage'),
  drCoverage: () => json('/api/dr-coverage'),
  isoAudit: () => json('/api/iso/audit-log'),
  demoSeed: () => json('/api/demo/seed', { method: 'POST' }),
};
