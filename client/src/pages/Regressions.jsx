import { useState } from 'react';
import { api } from '../api.js';

function buildRegressionForm(files, zipFile, extra = {}) {
  const fd = new FormData();
  for (const f of files) fd.append('logs', f);
  if (zipFile) fd.append('zip', zipFile);
  if (extra.runId != null && String(extra.runId).trim() !== '') fd.append('runId', String(extra.runId).trim());
  return fd;
}

export default function Regressions() {
  const [logFiles, setLogFiles] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [path, setPath] = useState('');
  const [runId, setRunId] = useState('');
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});

  const hasUpload = logFiles.length > 0 || zipFile != null;
  const pathOk = path.trim().length > 0;
  const canRun = hasUpload || pathOk;

  async function run(label, fn) {
    setBusy(label);
    try {
      const out = await fn();
      setResults((r) => ({ ...r, [label]: { ok: true, out } }));
    } catch (e) {
      setResults((r) => ({ ...r, [label]: { ok: false, error: String(e.message) } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h1 className="page-title">Regression sync</h1>
      <p className="page-lede">
        Upload logs or a zip for local processing, or point at a directory <strong>on the API server</strong> (CI /
        mounted scratch).
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Log files</div>
          <input
            type="file"
            multiple
            accept=".log,.txt,.out,.json,.report"
            className="field-input"
            onChange={(e) => setLogFiles(Array.from(e.target.files || []))}
          />
        </label>
        {logFiles.length > 0 && (
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.45rem' }}>
            {logFiles.length} file{logFiles.length === 1 ? '' : 's'} selected
          </div>
        )}

        <details style={{ marginBottom: '0.65rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.88rem', color: 'var(--muted)' }}>
            Advanced (server path, zip, run id)
          </summary>
          <label style={{ display: 'block', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Optional zip of logs / reports</div>
            <input
              type="file"
              accept=".zip"
              className="field-input"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label style={{ display: 'block', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Path visible to the API (absolute or relative to server cwd)
            </div>
            <input
              aria-label="Server regression directory path"
              className="field-input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              style={{ fontFamily: 'var(--mono)' }}
            />
          </label>
          <label style={{ display: 'block', marginTop: '0.45rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Coverage run id (optional)</div>
            <input
              className="field-input"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="e.g. nightly-042"
              style={{ fontFamily: 'var(--mono)' }}
            />
          </label>
        </details>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={!canRun || busy === 'reg'}
            onClick={() =>
              run('reg', () =>
                hasUpload
                  ? api.ingestRegressionUpload(buildRegressionForm(logFiles, zipFile))
                  : api.ingestRegressionDir(path.trim())
              )
            }
          >
            {busy === 'reg' ? 'Working…' : 'Bin failures'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!canRun || busy === 'cov'}
            onClick={() =>
              run('cov', () =>
                hasUpload
                  ? api.ingestCoverageUpload(buildRegressionForm(logFiles, zipFile, { runId }))
                  : api.ingestCoverageDir(path.trim(), runId.trim() || undefined)
              )
            }
          >
            {busy === 'cov' ? 'Working…' : 'Record coverage'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!canRun || busy === 'vr'}
            onClick={() =>
              run('vr', () =>
                hasUpload
                  ? api.scanRequirementLogsUpload(buildRegressionForm(logFiles, zipFile))
                  : api.scanVrCoverageDir(path.trim())
              )
            }
          >
            {busy === 'vr' ? 'Working…' : 'Scan logs'}
          </button>
        </div>
      </div>

      {Object.entries(results).map(([k, v]) => (
        <div key={k} className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
            {k === 'reg' ? 'Failure binning' : k === 'cov' ? 'Coverage' : 'Requirement IDs in logs'}
          </div>
          {v.ok ? (
            <pre
              style={{
                margin: 0,
                padding: '0.75rem',
                background: 'rgba(0,0,0,0.35)',
                borderRadius: 8,
                overflow: 'auto',
                fontSize: '0.78rem',
                fontFamily: 'var(--mono)',
                maxHeight: 320,
              }}
            >
              {JSON.stringify(v.out, null, 2)}
            </pre>
          ) : (
            <div style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>{v.error}</div>
          )}
        </div>
      ))}

      <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
        Regex keys: <code>regressionParsers</code>, <code>coverageRegex</code>, <code>vrLogRegex</code>. See{' '}
        <code>docs/configuration.md</code>.
      </p>
    </>
  );
}
