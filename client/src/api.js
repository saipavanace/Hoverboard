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

export const api = {
  health: () => json('/api/health'),
  config: () => json('/api/config'),
  saveConfig: (body) => json('/api/config', { method: 'PUT', body: JSON.stringify(body) }),
  specs: () => json('/api/specs'),
  createSpec: (body) => json('/api/specs', { method: 'POST', body: JSON.stringify(body) }),
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
  drs: () => json('/api/drs'),
  createDr: (body) => json('/api/drs', { method: 'POST', body: JSON.stringify(body) }),
  vrs: () => json('/api/vrs'),
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
  isoAudit: () => json('/api/iso/audit-log'),
  demoSeed: () => json('/api/demo/seed', { method: 'POST' }),
};
