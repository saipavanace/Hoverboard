import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useProject } from '../context/ProjectContext.jsx';

function findMatchStarts(haystack, needle) {
  if (!needle) return [];
  const out = [];
  let i = 0;
  while (i <= haystack.length - needle.length) {
    const j = haystack.indexOf(needle, i);
    if (j === -1) break;
    out.push(j);
    i = j + 1;
  }
  return out;
}

/** Scroll textarea vertically so the line containing `charIndex` is in view; browser handles horizontal for selections. */
function scrollTextareaToCharIndex(textarea, charIndex) {
  const value = textarea.value;
  const idx = Math.max(0, Math.min(charIndex, value.length));
  const before = value.slice(0, idx);
  const lineNumber = before.split('\n').length - 1;
  const style = window.getComputedStyle(textarea);
  let lineHeightPx = 18;
  const lh = style.lineHeight;
  if (lh && lh !== 'normal') {
    const n = parseFloat(lh);
    if (!Number.isNaN(n)) lineHeightPx = n;
  } else {
    lineHeightPx = Math.round((parseFloat(style.fontSize) || 13) * 1.35);
  }
  const padTop = parseFloat(style.paddingTop) || 0;
  const lineTop = lineNumber * lineHeightPx + padTop;
  const viewH = textarea.clientHeight;
  textarea.scrollTop = Math.max(0, lineTop - viewH * 0.35);
}

function focusSelectAndScroll(textarea, start, needleLen) {
  const end = start + needleLen;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  scrollTextareaToCharIndex(textarea, start);
  requestAnimationFrame(() => {
    textarea.setSelectionRange(start, end);
    scrollTextareaToCharIndex(textarea, start);
    textarea.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

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
  const [jsonFind, setJsonFind] = useState('');
  /** -1 = no match navigated yet (lets you type the full query without focus jumping) */
  const [jsonFindIndex, setJsonFindIndex] = useState(-1);
  const jsonTextareaRef = useRef(null);
  const jsonFindInputRef = useRef(null);

  const jsonFindStarts = useMemo(() => findMatchStarts(json, jsonFind), [json, jsonFind]);
  const jsonFindCount = jsonFindStarts.length;

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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.65rem',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flex: '1 1 180px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Find in JSON</span>
            <input
              ref={jsonFindInputRef}
              className="field-input"
              type="search"
              value={jsonFind}
              placeholder="Search…"
              onChange={(e) => {
                const v = e.target.value;
                setJsonFind(v);
                setJsonFindIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!jsonFindCount || !jsonFind) return;
                  const ta = jsonTextareaRef.current;
                  if (!ta) return;
                  const nextIdx = e.shiftKey
                    ? jsonFindIndex < 0
                      ? jsonFindCount - 1
                      : (jsonFindIndex - 1 + jsonFindCount) % jsonFindCount
                    : jsonFindIndex < 0
                      ? 0
                      : (jsonFindIndex + 1) % jsonFindCount;
                  setJsonFindIndex(nextIdx);
                  focusSelectAndScroll(ta, jsonFindStarts[nextIdx], jsonFind.length);
                }
                if (e.key === 'Escape') {
                  setJsonFind('');
                  setJsonFindIndex(-1);
                  jsonTextareaRef.current?.focus();
                }
              }}
              style={{ flex: 1, minWidth: 120 }}
            />
          </label>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            {jsonFind
              ? jsonFindCount
                ? jsonFindIndex < 0
                  ? `${jsonFindCount} match${jsonFindCount === 1 ? '' : 'es'} — use Next or Enter`
                  : `${jsonFindIndex + 1} / ${jsonFindCount}`
                : '0 matches'
              : ''}
          </span>
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: '0.82rem', padding: '0.25rem 0.55rem' }}
            disabled={!jsonFindCount}
            onClick={() => {
              const nextIdx =
                jsonFindIndex < 0 ? jsonFindCount - 1 : (jsonFindIndex - 1 + jsonFindCount) % jsonFindCount;
              setJsonFindIndex(nextIdx);
              const ta = jsonTextareaRef.current;
              if (ta && jsonFind) focusSelectAndScroll(ta, jsonFindStarts[nextIdx], jsonFind.length);
            }}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: '0.82rem', padding: '0.25rem 0.55rem' }}
            disabled={!jsonFindCount}
            onClick={() => {
              const nextIdx = jsonFindIndex < 0 ? 0 : (jsonFindIndex + 1) % jsonFindCount;
              setJsonFindIndex(nextIdx);
              const ta = jsonTextareaRef.current;
              if (ta && jsonFind) focusSelectAndScroll(ta, jsonFindStarts[nextIdx], jsonFind.length);
            }}
          >
            Next
          </button>
        </div>
        <textarea
          ref={jsonTextareaRef}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
              e.preventDefault();
              jsonFindInputRef.current?.focus();
              jsonFindInputRef.current?.select();
            }
          }}
          rows={16}
          spellCheck={false}
          style={{
            width: '100%',
            fontFamily: 'var(--mono)',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            padding: '0.75rem',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.35)',
            color: 'var(--text)',
            whiteSpace: 'pre',
            overflow: 'auto',
            tabSize: 2,
          }}
        />
        <button type="button" className="btn-primary" style={{ marginTop: '0.65rem' }} onClick={saveJsonConfig}>
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
            <li>
              iso26262Enabled: {String(cfg.iso26262Enabled === true)} — set <code>true</code> in JSON to enable ISO 26262 workspace, project Audit, and <code>/api/iso/*</code>
            </li>
            <li>
              notifications: {String(cfg.notifications?.enabled === true)} · SMTP host:{' '}
              {cfg.notifications?.smtp?.host || '—'} · pass:{' '}
              {cfg.notifications?.smtp?.passConfigured ? 'configured' : 'not set'}
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
