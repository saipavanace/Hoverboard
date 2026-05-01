import { useEffect, useState } from 'react';
import { api } from '../api.js';

function stripEphemeralKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const { authUi, ...rest } = obj;
  return rest;
}

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [json, setJson] = useState('');
  const [builtinEmail, setBuiltinEmail] = useState('');
  const [builtinUsername, setBuiltinUsername] = useState('');
  const [builtinPassword, setBuiltinPassword] = useState('');

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setCfg(c);
        setJson(JSON.stringify(stripEphemeralKeys(c), null, 2));
        const ba = c.auth?.builtinAdmin || {};
        setBuiltinEmail(ba.email || 'admin@hoverboard.builtin');
        setBuiltinUsername(ba.username || 'admin');
        setBuiltinPassword('');
      })
      .catch(() => setCfg({}));
  }, []);

  return (
    <>
      <h1 className="page-title">Configuration</h1>
      <p className="page-lede">
        Project-independent controls: branding, regression roots, auth, release metric weights. Full key reference lives in{' '}
        <code>docs/configuration.md</code>.
      </p>

      {cfg && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Built-in administrator (local login)</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Maps to the reserved database account used for break-glass login. Set <strong>login username</strong> (what you type
            at the login screen) and <strong>email</strong> (stored user identity). The numeric <strong>user id</strong> in the
            database is assigned automatically and cannot be changed. Prefer{' '}
            <code>HOVERBOARD_BUILTIN_ADMIN_PASSWORD</code> in production instead of storing a password in this file.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.65rem',
              alignItems: 'end',
            }}
          >
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Email (stored)</div>
              <input
                className="field-input"
                type="email"
                value={builtinEmail}
                onChange={(e) => setBuiltinEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Login username</div>
              <input
                className="field-input"
                value={builtinUsername}
                onChange={(e) => setBuiltinUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
              />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>New password</div>
              <input
                className="field-input"
                type="password"
                value={builtinPassword}
                onChange={(e) => setBuiltinPassword(e.target.value)}
                placeholder="leave blank to keep"
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                try {
                  const base = await api.config();
                  const rest = stripEphemeralKeys(base);
                  const next = {
                    ...rest,
                    auth: {
                      ...rest.auth,
                      builtinAdmin: {
                        ...rest.auth?.builtinAdmin,
                        email: builtinEmail.trim() || 'admin@hoverboard.builtin',
                        username: builtinUsername.trim() || 'admin',
                        ...(builtinPassword.trim() ? { password: builtinPassword } : {}),
                      },
                    },
                  };
                  const saved = await api.saveConfig(next);
                  setCfg(saved);
                  setJson(JSON.stringify(stripEphemeralKeys(saved), null, 2));
                  const ba = saved.auth?.builtinAdmin || {};
                  setBuiltinEmail(ba.email || 'admin@hoverboard.builtin');
                  setBuiltinUsername(ba.username || 'admin');
                  setBuiltinPassword('');
                  alert('Saved. Built-in account updated on the server.');
                } catch (e) {
                  alert(String(e.message || e));
                }
              }}
            >
              Save built-in admin
            </button>
          </div>
        </div>
      )}

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
              const saved = await api.saveConfig(stripEphemeralKeys(parsed));
              setCfg(saved);
              setJson(JSON.stringify(stripEphemeralKeys(saved), null, 2));
              const ba = saved.auth?.builtinAdmin || {};
              setBuiltinEmail(ba.email || 'admin@hoverboard.builtin');
              setBuiltinUsername(ba.username || 'admin');
              setBuiltinPassword('');
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
            <li>
              built-in admin: username={cfg.authUi?.builtinLoginUsername ?? cfg.auth?.builtinAdmin?.username ?? 'admin'} · email=
              {cfg.authUi?.builtinAdminEmail ?? cfg.auth?.builtinAdmin?.email ?? '—'}
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
