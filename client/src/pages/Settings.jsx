import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

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

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [json, setJson] = useState('');
  const [builtinEmail, setBuiltinEmail] = useState('');
  const [builtinUsername, setBuiltinUsername] = useState('');
  const [builtinPassword, setBuiltinPassword] = useState('');
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
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 0, marginBottom: '0.65rem' }}>
          Type your search in the find bar first; the JSON area only scrolls when you use <strong>Next</strong>,{' '}
          <strong>Prev</strong>, or <strong>Enter</strong> (so focus stays in the find field while you type). Browser{' '}
          <kbd>Cmd+F</kbd> / <kbd>Ctrl+F</kbd> may not work in Cursor’s embedded preview — use the find bar or a normal
          browser tab. <kbd>Cmd+S</kbd> / <kbd>Ctrl+S</kbd> saves this JSON to the server (same as Save). For{' '}
          <code>requirementCategories</code>, you may use a nested tree: each entry is a string or{' '}
          <code>{'{ "name": "Group", "children": ["A", { "name": "Sub", "children": ["B"] }] }'}</code>
          — stored values are full paths like <code>Group / A</code> (see <code>docs/configuration.md</code>).
        </p>
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
          </ul>
        </div>
      )}
    </>
  );
}
