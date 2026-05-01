import { useState } from 'react';
import { api } from '../api.js';

export default function Regressions() {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});
  const [strict, setStrict] = useState(true);

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
        Point Hoverboard at a regression directory <strong>visible to the API host</strong> (mounted
        scratch, NFS, sync target). For remote scratch you don&apos;t mount on this Mac, run a small
        sync agent that downloads or rsyncs into a local path and call these endpoints from CI.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Regression directory (absolute or relative to the API server)
          </div>
          <input
            className="field-input"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/scratch/.../regression/2026_04_30_094117"
            style={{ fontFamily: 'var(--mono)' }}
          />
        </label>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '0.65rem',
            fontSize: '0.85rem',
          }}
        >
          <input
            type="checkbox"
            checked={strict}
            onChange={(e) => setStrict(e.target.checked)}
          />
          VR scan: only count VR IDs inside <code>UVM_INFO/UVM_NOTE</code> lines
        </label>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={!path || busy === 'reg'}
            onClick={() => run('reg', () => api.ingestRegressionDir(path))}
          >
            {busy === 'reg' ? 'Scanning…' : 'Ingest failures (binning)'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!path || busy === 'cov'}
            onClick={() => run('cov', () => api.ingestCoverageDir(path))}
          >
            {busy === 'cov' ? 'Scanning…' : 'Ingest coverage (functional + code)'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!path || busy === 'vr'}
            onClick={() => run('vr', () => api.scanVrCoverageDir(path, strict))}
          >
            {busy === 'vr' ? 'Scanning…' : 'Scan VR coverage from logs'}
          </button>
        </div>
      </div>

      {Object.entries(results).map(([k, v]) => (
        <div key={k} className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
            {k === 'reg'
              ? 'Failure binning'
              : k === 'cov'
                ? 'Coverage extraction'
                : 'VR coverage scan'}
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

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>How parsers / regex are configured</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)', fontSize: '0.92rem' }}>
          <li>
            <code>regressionParsers</code> — per-line failure regexes (defaults: FAIL, ERROR, ASSERT, timeout, UVM_FATAL).
          </li>
          <li>
            <code>coverageRegex.functional</code> / <code>coverageRegex.code</code> — patterns extracting percentages from text reports; JSON files with <code>functional_coverage</code> / <code>code_coverage</code> keys are auto-detected.
          </li>
          <li>
            <code>vrLogRegex</code> — must capture the VR ID in group 1; default scopes to <code>UVM_INFO</code> / <code>UVM_NOTE</code>.
          </li>
          <li>See <code>docs/configuration.md</code> for full key reference.</li>
        </ul>
      </div>
    </>
  );
}
