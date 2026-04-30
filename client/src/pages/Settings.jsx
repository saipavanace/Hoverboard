import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [json, setJson] = useState('');

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setCfg(c);
        setJson(JSON.stringify(c, null, 2));
      })
      .catch(() => setCfg({}));
  }, []);

  return (
    <>
      <h1 className="page-title">Configuration</h1>
      <p className="page-lede">
        Project-independent controls: branding, regression roots, release metric weights. Full key
        reference lives in <code>docs/configuration.md</code>.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Live config (JSON)</div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={16}
          style={{
            width: '100%',
            fontFamily: 'var(--mono)',
            fontSize: '0.82rem',
            padding: '0.75rem',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.35)',
            color: 'var(--text)',
          }}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: '0.65rem' }}
          onClick={async () => {
            try {
              const parsed = JSON.parse(json);
              const saved = await api.saveConfig(parsed);
              setCfg(saved);
              setJson(JSON.stringify(saved, null, 2));
              alert('Saved to hoverboard.config.json on the server.');
            } catch (e) {
              alert(`Invalid JSON: ${e.message}`);
            }
          }}
        >
          Save
        </button>
      </div>

      {cfg && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Quick view</div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)', fontSize: '0.92rem' }}>
            <li>projectName: {cfg.projectName}</li>
            <li>companyName: {cfg.companyName}</li>
            <li>regressionRoots: {(cfg.regressionRoots || []).join(', ') || '—'}</li>
          </ul>
        </div>
      )}
    </>
  );
}
