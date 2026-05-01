import { useState, useEffect } from 'react';
import { useNavigate, Link, Navigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ldapUsername, setLdapUsername] = useState('');
  const [ldapPassword, setLdapPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg({}));
  }, []);

  const from =
    typeof location.state?.from === 'string' && location.state.from.startsWith('/')
      ? location.state.from
      : '/projects';

  const authUi = cfg?.authUi;
  const authDisabled = Boolean(authUi?.authDisabled);
  const showLocal = authDisabled ? false : authUi?.localLoginEnabled !== false;
  const showOidc = Boolean(authUi?.oidcConfigured) && !authDisabled;
  const showLdap = Boolean(authUi?.ldapLoginEnabled) && !authDisabled;

  const accent = cfg?.branding?.accent || '#14b8a6';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.authLogin({ email: email.trim(), password });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function onLdapSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.authLdapLogin({ username: ldapUsername.trim(), password: ldapPassword });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'LDAP login failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !cfg) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
        }}
        role="status"
      >
        Loading…
      </div>
    );
  }

  if (user?.authDisabled) {
    return <Navigate to="/projects" replace />;
  }

  if (user?.id) {
    return <Navigate to={from} replace />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.75rem', letterSpacing: '-0.03em', color: accent }}>
            Hoverboard
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem' }}>
            Sign in to manage requirements, verification, and evidence.
          </p>
        </div>

        <div
          className="card"
          style={{
            padding: '1.35rem',
            borderRadius: 14,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          {showOidc && (
            <div style={{ marginBottom: showLocal ? '1.25rem' : 0 }}>
              <a
                href="/api/auth/oidc/start"
                className="btn-primary"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '0.65rem 1rem',
                  borderRadius: 10,
                  textDecoration: 'none',
                  fontWeight: 700,
                  background: accent,
                  color: 'var(--nav-active-fg, #0f172a)',
                }}
              >
                Login with SSO
              </a>
              {(showLocal || showLdap) && (
                <div
                  style={{
                    margin: '1rem 0',
                    textAlign: 'center',
                    fontSize: '0.78rem',
                    color: 'var(--muted)',
                  }}
                >
                  or continue below
                </div>
              )}
            </div>
          )}

          {showLdap && (
            <form onSubmit={onLdapSubmit} style={{ display: 'grid', gap: '0.85rem', marginBottom: showLocal ? '1.25rem' : 0 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center' }}>
                Corporate directory (LDAP)
              </div>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Username</div>
                <input
                  className="field-input"
                  type="text"
                  autoComplete="username"
                  value={ldapUsername}
                  onChange={(e) => setLdapUsername(e.target.value)}
                  required
                />
              </label>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Password</div>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="current-password"
                  value={ldapPassword}
                  onChange={(e) => setLdapPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in with LDAP'}
              </button>
            </form>
          )}

          {showLocal && (
            <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.85rem' }}>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Username</div>
                <input
                  className="field-input"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={authUi?.builtinLoginUsername || 'admin'}
                  required
                />
              </label>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Password</div>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {error && (
                <div style={{ color: '#f87171', fontSize: '0.9rem' }} role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {!showLocal && !showOidc && !showLdap && !authDisabled && (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
              Login is not configured. Enable local login, LDAP, or OIDC in <code>hoverboard.config.json</code>.
            </p>
          )}

          {authDisabled && (
            <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: 0 }}>
              Authentication is disabled on the server (development mode). Open the app without signing in.
            </p>
          )}

          <div style={{ marginTop: '1.15rem', fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'center' }}>
            <Link to="/projects" style={{ color: accent }}>
              Project list
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
