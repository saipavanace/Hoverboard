import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

const EXAMPLES = [
  'What does the spec say about CHI exclusive access?',
  'Which DRs are impacted by this section?',
  'Do we have VRs covering this behavior?',
  'Which tests prove this requirement?',
  'What changed between spec versions for this section?',
  'Are there any unverified safety requirements?',
];

function StatusBadge({ status }) {
  if (!status) {
    return (
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
        not indexed
      </span>
    );
  }
  const colors = {
    ready: '#059669',
    failed: '#dc2626',
    extracting: '#d97706',
    chunking: '#d97706',
    embedding: '#2563eb',
    uploaded: '#64748b',
  };
  const c = colors[status] || '#64748b';
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: c, textTransform: 'uppercase' }}>{status}</span>
  );
}

/** Maps ingestion phase → displayed progress (deterministic bar segments). */
function statusProgressPct(status) {
  switch (status) {
    case 'extracting':
      return 28;
    case 'chunking':
      return 52;
    case 'embedding':
      return 82;
    case 'ready':
      return 100;
    case 'failed':
      return 100;
    default:
      return 12;
  }
}

export default function SpecPilot() {
  const { projectId } = useParams();

  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  /** @type {Set<number>} spec_version_id */
  const [selectedVid, setSelectedVid] = useState(() => new Set());
  const [includeDRs, setIncludeDRs] = useState(true);
  const [includeVRs, setIncludeVRs] = useState(true);
  const [includeTests, setIncludeTests] = useState(true);
  const [strictCitations, setStrictCitations] = useState(false);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [viewerChunk, setViewerChunk] = useState(null);
  const [highlight, setHighlight] = useState('');

  /** When set, background reindex is running for this spec_version_id */
  const [reindexingVid, setReindexingVid] = useState(null);
  const [reindexStatus, setReindexStatus] = useState('');
  const [reindexProgress, setReindexProgress] = useState(0);

  const busy = asking || reindexingVid != null;

  function loadVersions() {
    setLoadingVersions(true);
    api
      .specpilotSpecVersions()
      .then((rows) => {
        setVersions(rows);
        setSelectedVid(new Set(rows.map((r) => r.spec_version_id)));
      })
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }

  useEffect(() => {
    loadVersions();
  }, [projectId]);

  /** Poll index status while a reindex is running */
  useEffect(() => {
    if (reindexingVid == null) return undefined;

    let cancelled = false;

    const poll = async () => {
      try {
        const rows = await api.specpilotSpecVersions();
        if (cancelled) return;
        setVersions(rows);
        const row = rows.find((r) => r.spec_version_id === reindexingVid);
        const st = row?.status || '';
        setReindexStatus(st || 'queued…');
        setReindexProgress(statusProgressPct(st));

        if (st === 'ready' || st === 'failed') {
          setReindexingVid(null);
          setReindexStatus('');
          setReindexProgress(0);
        }
      } catch {
        /* keep polling */
      }
    };

    poll();
    const id = setInterval(poll, 400);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reindexingVid]);

  function toggleVersion(specVersionId) {
    setSelectedVid((prev) => {
      const next = new Set(prev);
      if (next.has(specVersionId)) next.delete(specVersionId);
      else next.add(specVersionId);
      return next;
    });
  }

  function selectAll() {
    setSelectedVid(new Set(versions.map((v) => v.spec_version_id)));
  }

  function selectNone() {
    setSelectedVid(new Set());
  }

  async function onReindex(specVersionId) {
    setError(null);
    setReindexStatus('starting…');
    setReindexProgress(8);
    setReindexingVid(specVersionId);
    try {
      await api.specpilotReindexSpecVersion(specVersionId);
    } catch (err) {
      setReindexingVid(null);
      setReindexStatus('');
      setReindexProgress(0);
      setError(err.message || String(err));
    }
  }

  async function onAsk(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    if (selectedVid.size === 0) {
      setError('Select at least one specification version to search.');
      return;
    }
    setAsking(true);
    setError(null);
    setResult(null);
    try {
      const documentIds = [...selectedVid];
      const res = await api.specpilotAsk({
        question: q,
        documentIds,
        includeDRs,
        includeVRs,
        includeTests,
        strictCitationsOnly: strictCitations,
      });
      setResult(res);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setAsking(false);
    }
  }

  async function openCitation(cit) {
    const id = cit.sourceId;
    if (!id) return;
    try {
      const row = await api.specpilotChunk(id);
      setViewerChunk(row);
      setHighlight(cit.snippet || '');
    } catch {
      setError('Could not load cited chunk');
    }
  }

  async function onSuggestedCreateDr(action) {
    const excerpt = window.prompt('DR excerpt / description', action.description || '') || '';
    if (!excerpt.trim()) return;
    try {
      const firstCitation = result?.answer?.citations?.[0];
      await api.specpilotCreateDr({
        title: action.title,
        excerpt: excerpt.trim(),
        description: action.description,
        chunkId: firstCitation?.sourceId,
        category: undefined,
      });
      alert('DR created.');
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function onSuggestedCreateVr(action) {
    const drIds = window.prompt('Comma-separated DR public IDs to link (e.g. DR-00001)', '');
    if (!drIds) return;
    try {
      const firstCitation = result?.answer?.citations?.[0];
      await api.specpilotCreateVr({
        title: action.title,
        description: action.description,
        drPublicIds: drIds.split(',').map((s) => s.trim()).filter(Boolean),
        category: action.description?.slice(0, 80) || 'general',
        chunkId: firstCitation?.sourceId,
      });
      alert('VR created.');
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  const answer = result?.answer;
  const selectedCount = selectedVid.size;
  const totalVersions = versions.length;

  const askDisabled = busy || selectedVid.size === 0;
  const askDisabledHint =
    busy || totalVersions === 0
      ? null
      : selectedVid.size === 0
        ? 'Select at least one specification version on the left to search.'
        : null;

  return (
    <div>
      <style>{`
        @keyframes specpilot-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .specpilot-progress-track {
          height: 8px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--border) 80%, transparent);
          overflow: hidden;
          position: relative;
        }
        .specpilot-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(20,184,166,0.35), rgba(20,184,166,0.95), rgba(20,184,166,0.35));
          background-size: 200% 100%;
          transition: width 0.35s ease;
        }
        .specpilot-progress-indet::after {
          content: '';
          position: absolute;
          inset: 0;
          width: 40%;
          background: linear-gradient(90deg, transparent, rgba(20,184,166,0.55), transparent);
          animation: specpilot-indeterminate 1.1s ease-in-out infinite;
        }
        .specpilot-layout {
          display: grid;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          gap: 1.5rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .specpilot-layout {
            grid-template-columns: 1fr;
          }
        }
        .specpilot-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1rem;
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          min-width: 0;
        }
        .specpilot-dropdown summary::-webkit-details-marker {
          display: none;
        }
        /* Specifications: looks like a dropdown / expandable select */
        .specpilot-dropdown {
          margin: 0;
        }
        .specpilot-dropdown summary.specpilot-dropdown-trigger {
          cursor: pointer;
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: nowrap;
          padding: 10px 12px;
          margin: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          box-sizing: border-box;
          width: 100%;
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          user-select: none;
        }
        .specpilot-dropdown summary.specpilot-dropdown-trigger:hover {
          border-color: color-mix(in srgb, var(--border) 40%, var(--text));
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        .specpilot-dropdown summary.specpilot-dropdown-trigger:focus {
          outline: none;
        }
        .specpilot-dropdown summary.specpilot-dropdown-trigger:focus-visible {
          outline: 2px solid rgba(20, 184, 166, 0.55);
          outline-offset: 2px;
        }
        .specpilot-dropdown .specpilot-dd-icon {
          flex-shrink: 0;
          opacity: 0.7;
          color: var(--muted);
        }
        .specpilot-dropdown .specpilot-dd-icon--collapse {
          display: none;
        }
        .specpilot-dropdown[open] .specpilot-dd-icon--expand {
          display: none;
        }
        .specpilot-dropdown[open] .specpilot-dd-icon--collapse {
          display: inline-flex;
        }
        .specpilot-dropdown-body {
          margin-top: 10px;
          padding-top: 2px;
        }
      `}</style>

      <h1 className="page-title">SpecPilot</h1>

      {reindexingVid != null && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 6 }}>
            Reindexing… {reindexStatus ? `(${reindexStatus})` : ''}
          </div>
          <div className="specpilot-progress-track specpilot-progress-indet">
            <div
              className="specpilot-progress-fill"
              style={{
                width: `${reindexProgress}%`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      <div className="specpilot-layout">
        <aside className="specpilot-card">
          <details defaultOpen className="specpilot-dropdown">
            <summary className="specpilot-dropdown-trigger">
              <span style={{ minWidth: 0, textAlign: 'left' }}>Specifications</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedCount}/{totalVersions} selected
                </span>
                <svg
                  className="specpilot-dd-icon specpilot-dd-icon--expand"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
                </svg>
                <svg
                  className="specpilot-dd-icon specpilot-dd-icon--collapse"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6-1.41-1.41z" />
                </svg>
              </span>
            </summary>
            <div className="specpilot-dropdown-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: '0.65rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn-ghost" disabled={busy} onClick={selectAll}>
                  Select all
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={selectNone}>
                  Select none
                </button>
              </div>

              {loadingVersions ? (
                <div style={{ color: 'var(--muted)' }}>Loading…</div>
              ) : versions.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  No specification versions in this project yet. Add them under Specs.
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 420, overflow: 'auto' }}>
                  {versions.map((v) => (
                    <li
                      key={v.spec_version_id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        padding: '0.55rem 0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          cursor: busy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedVid.has(v.spec_version_id)}
                          onChange={() => toggleVersion(v.spec_version_id)}
                          disabled={busy}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.86rem', lineHeight: 1.35 }}>
                          {v.spec_name}
                          <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · v{v.version_label}</span>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 400 }}>
                            {v.original_filename || '—'}
                          </div>
                        </span>
                      </label>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <StatusBadge status={v.status} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          {v.chunk_count ?? 0} chunks
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => onReindex(v.spec_version_id)}
                      >
                        Reindex
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </aside>

        <section className="specpilot-card" style={{ margin: 0 }}>
          <form onSubmit={onAsk} style={{ marginBottom: askDisabledHint ? '0.5rem' : '1.25rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Question</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={EXAMPLES[0]}
              rows={3}
              disabled={busy}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.65rem',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                opacity: busy ? 0.7 : 1,
              }}
            />
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
              Examples: {EXAMPLES.slice(0, 3).join(' · ')}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={includeDRs}
                  onChange={(e) => setIncludeDRs(e.target.checked)}
                  disabled={busy}
                />
                Include DRs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={includeVRs}
                  onChange={(e) => setIncludeVRs(e.target.checked)}
                  disabled={busy}
                />
                Include VRs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={includeTests}
                  onChange={(e) => setIncludeTests(e.target.checked)}
                  disabled={busy}
                />
                Include tests
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={strictCitations}
                  onChange={(e) => setStrictCitations(e.target.checked)}
                  disabled={busy}
                />
                Strict citations only
              </label>
              <button
                type="submit"
                disabled={askDisabled}
                title={askDisabledHint || undefined}
                style={{ marginLeft: 'auto' }}
              >
                {asking ? 'Asking…' : 'Ask'}
              </button>
            </div>
            {askDisabledHint && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--muted)', maxWidth: '62ch' }}>
                {askDisabledHint}
              </p>
            )}
          </form>

          {error && (
            <div
              role="alert"
              style={{
                padding: '0.75rem',
                borderRadius: 8,
                background: 'rgba(220,38,38,0.12)',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          {answer && (
            <div
              style={{
                marginTop: '1rem',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                background: 'color-mix(in srgb, var(--surface) 98%, transparent)',
              }}
            >
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Status</div>
                <div style={{ fontWeight: 700 }}>{answer.status}</div>
                {result?.cached && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Cached answer</div>
                )}
              </div>

              <section style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Short answer</h2>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{answer.shortAnswer}</p>
              </section>

              <section style={{ marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Detailed answer</h2>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{answer.detailedAnswer}</p>
              </section>

              {answer.keyRules?.length > 0 && (
                <section style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Key rules</h2>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '0.35rem' }}>Rule</th>
                        <th style={{ padding: '0.35rem' }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {answer.keyRules.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.35rem', verticalAlign: 'top' }}>{r.rule}</td>
                          <td style={{ padding: '0.35rem' }}>{r.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {answer.impactedDRs?.length > 0 && (
                <section style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Impacted DRs</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {answer.impactedDRs.map((d, i) => (
                      <li key={i}>
                        <strong>{d.id}</strong> — {d.title}{' '}
                        <span style={{ color: 'var(--muted)' }}>({d.status})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {answer.vrCoverage?.length > 0 && (
                <section style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>VR coverage</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {answer.vrCoverage.map((vr, i) => (
                      <li key={i}>
                        <strong>{vr.id}</strong> — {vr.title} ({vr.coverageStatus})
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {answer.tests?.length > 0 && (
                <section style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Tests</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {answer.tests.map((t, i) => (
                      <li key={i}>
                        <strong>{t.name}</strong> — {t.proves} ({t.latestResult})
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {answer.gaps?.length > 0 && (
                <section style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Gaps</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {answer.gaps.map((g, i) => (
                      <li key={i}>
                        {g.gap}
                        {g.recommendedAction ? (
                          <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{g.recommendedAction}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {answer.citations?.length > 0 && (
                <section style={{ marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Citations</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {answer.citations.map((c, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => openCitation(c)}
                          disabled={busy}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--link, #14b8a6)',
                            cursor: busy ? 'not-allowed' : 'pointer',
                            textAlign: 'left',
                            textDecoration: 'underline',
                          }}
                        >
                          {c.documentName} — {c.sectionPath} (pp. {c.pageStart}–{c.pageEnd})
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {answer.suggestedActions?.length > 0 && (
                <section>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.35rem' }}>Suggested actions</h2>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {answer.suggestedActions.map((a, i) => (
                      <li key={i} style={{ marginBottom: 8 }}>
                        <strong>{a.actionType}</strong>: {a.title}
                        <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>{a.description}</div>
                        {a.actionType === 'create_dr' && (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => onSuggestedCreateDr(a)}
                          >
                            Create DR
                          </button>
                        )}
                        {a.actionType === 'create_vr' && (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => onSuggestedCreateVr(a)}
                          >
                            Create VR
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </section>
      </div>

      {viewerChunk && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
          onClick={() => setViewerChunk(null)}
        >
          <div
            style={{
              maxWidth: 720,
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              background: 'var(--surface)',
              color: 'var(--text)',
              borderRadius: 12,
              padding: '1rem',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{viewerChunk.document_display_name || viewerChunk.file_name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {viewerChunk.section_path}
                  {viewerChunk.page_start != null ? ` · p. ${viewerChunk.page_start}–${viewerChunk.page_end}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => setViewerChunk(null)}>
                Close
              </button>
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.85rem',
                marginTop: '0.75rem',
                fontFamily: 'var(--mono, ui-monospace, monospace)',
              }}
            >
              {highlight && viewerChunk.text?.includes(highlight)
                ? viewerChunk.text.split(highlight).join(`【${highlight}】`)
                : viewerChunk.text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
