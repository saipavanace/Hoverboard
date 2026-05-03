import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import JsonTextSearchField from '../components/JsonTextSearchField.jsx';
import { useProject } from '../context/ProjectContext.jsx';

function stripEphemeralKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const { authUi, requirementCategoryValues, ...rest } = obj;
  return rest;
}

function emailsDisplayForEvent(subscriptions, eventKey) {
  const rows = (subscriptions || []).filter(
    (s) => s.event === eventKey && (s.projectId == null || s.projectId === '')
  );
  const set = new Set();
  for (const s of rows) {
    const raw = s.emails;
    const arr = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/);
    for (const e of arr) {
      const t = String(e).trim();
      if (t) set.add(t);
    }
  }
  return [...set].join(', ');
}

function buildNotificationSubscriptions(specLine, drLine, vrLine) {
  const subs = [];
  const parse = (line) =>
    String(line || '')
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const a = parse(specLine);
  const b = parse(drLine);
  const c = parse(vrLine);
  if (a.length) subs.push({ event: 'spec_version_published', projectId: null, emails: a });
  if (b.length) subs.push({ event: 'dr_stale_after_spec', projectId: null, emails: b });
  if (c.length) subs.push({ event: 'vr_orphan_stale', projectId: null, emails: c });
  return subs;
}

export default function Settings() {
  const { projects } = useProject();
  const [cfg, setCfg] = useState(null);
  const [json, setJson] = useState('');
  const [builtinEmail, setBuiltinEmail] = useState('');
  const [builtinUsername, setBuiltinUsername] = useState('');
  const [builtinPassword, setBuiltinPassword] = useState('');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [fromName, setFromName] = useState('Hoverboard');
  const [fromAddress, setFromAddress] = useState('');
  const [emailsSpec, setEmailsSpec] = useState('');
  const [emailsDrStale, setEmailsDrStale] = useState('');
  const [emailsVrStale, setEmailsVrStale] = useState('');
  const [notifProjectScope, setNotifProjectScope] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const saveJsonConfig = useCallback(async () => {
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
  }, [json]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveJsonConfig();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveJsonConfig]);

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
        const n = c.notifications || {};
        const subs = n.subscriptions || [];
        setNotifEnabled(Boolean(n.enabled));
        setSmtpHost(n.smtp?.host || '');
        setSmtpPort(Number(n.smtp?.port) || 587);
        setSmtpSecure(Boolean(n.smtp?.secure));
        setSmtpUser(n.smtp?.user || '');
        setSmtpPass('');
        setFromName(n.smtp?.from?.name || 'Hoverboard');
        setFromAddress(n.smtp?.from?.address || '');
        setEmailsSpec(emailsDisplayForEvent(subs, 'spec_version_published'));
        setEmailsDrStale(emailsDisplayForEvent(subs, 'dr_stale_after_spec'));
        setEmailsVrStale(emailsDisplayForEvent(subs, 'vr_orphan_stale'));
        setNotifProjectScope('');
      })
      .catch(() => setCfg({}));
  }, []);

  return (
    <>
      <h1 className="page-title">Configuration</h1>

      {cfg && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Email notifications</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <input type="checkbox" checked={notifEnabled} onChange={(e) => setNotifEnabled(e.target.checked)} />
            <span style={{ fontSize: '0.9rem' }}>Enable event-driven notifications</span>
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.65rem',
              marginBottom: '0.65rem',
            }}
          >
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>SMTP host</div>
              <input
                className="field-input"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                autoComplete="off"
              />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Port</div>
              <input
                className="field-input"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-end', gap: '0.45rem', paddingBottom: '0.15rem' }}>
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
              <span style={{ fontSize: '0.85rem' }}>TLS (SSL)</span>
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>SMTP user</div>
              <input className="field-input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>SMTP password</div>
              <input
                className="field-input"
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={cfg.notifications?.smtp?.passConfigured ? '(configured — leave blank to keep)' : ''}
                autoComplete="new-password"
              />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>From name</div>
              <input className="field-input" value={fromName} onChange={(e) => setFromName(e.target.value)} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>From address</div>
              <input
                className="field-input"
                type="email"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                placeholder="noreply@example.com"
              />
            </label>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            Production: set <code>HOVERBOARD_SMTP_PASS</code> instead of storing the password in JSON.
          </div>
          <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.65rem' }}>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Spec version published — recipients (comma-separated)
              </div>
              <input className="field-input" value={emailsSpec} onChange={(e) => setEmailsSpec(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                DR(s) marked stale after spec change — recipients
              </div>
              <input className="field-input" value={emailsDrStale} onChange={(e) => setEmailsDrStale(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                VR(s) stale (sole DR deleted) — recipients
              </div>
              <input className="field-input" value={emailsVrStale} onChange={(e) => setEmailsVrStale(e.target.value)} />
            </label>
          </div>
          <label style={{ display: 'block', marginBottom: '0.65rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Scope helper — copy project ID for JSON subscriptions only
            </div>
            <select
              className="field-input"
              value={notifProjectScope}
              onChange={(e) => setNotifProjectScope(e.target.value)}
              style={{ maxWidth: 360 }}
            >
              <option value="">—</option>
              {(projects || []).map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} (id {p.id})
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.65rem' }}>
            <input
              className="field-input"
              type="email"
              placeholder="test@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              style={{ flex: '1 1 200px', minWidth: 160 }}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={testBusy || !testTo.trim()}
              onClick={async () => {
                setTestBusy(true);
                try {
                  await api.testNotificationEmail(testTo.trim());
                  alert('Test email sent (check SMTP logs if it does not arrive).');
                } catch (e) {
                  alert(String(e.message || e));
                } finally {
                  setTestBusy(false);
                }
              }}
            >
              {testBusy ? 'Sending…' : 'Send test email'}
            </button>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              try {
                const base = await api.config();
                const rest = stripEphemeralKeys(base);
                const prevSubs = base.notifications?.subscriptions || [];
                const scoped = prevSubs.filter((s) => s.projectId != null && s.projectId !== '');
                const global = buildNotificationSubscriptions(emailsSpec, emailsDrStale, emailsVrStale);
                const mergedSubs = [...scoped, ...global];
                const next = {
                  ...rest,
                  notifications: {
                    enabled: notifEnabled,
                    smtp: {
                      host: smtpHost.trim(),
                      port: Number(smtpPort) || 587,
                      secure: smtpSecure,
                      user: smtpUser.trim(),
                      from: {
                        name: fromName.trim() || 'Hoverboard',
                        address: fromAddress.trim(),
                      },
                      ...(smtpPass.trim() ? { pass: smtpPass } : {}),
                    },
                    subscriptions: mergedSubs,
                  },
                };
                const saved = await api.saveConfig(next);
                setCfg(saved);
                setJson(JSON.stringify(stripEphemeralKeys(saved), null, 2));
                setSmtpPass('');
                alert('Notification settings saved.');
              } catch (e) {
                alert(String(e.message || e));
              }
            }}
          >
            Save notification settings
          </button>
        </div>
      )}

      {cfg && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Built-in administrator (local login)</div>
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
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Live config (JSON)</div>
        <JsonTextSearchField value={json} onChange={setJson} rows={16} />
        <button type="button" className="btn-primary" style={{ marginTop: '0.65rem' }} onClick={saveJsonConfig}>
          Save
        </button>
      </div>
    </>
  );
}
