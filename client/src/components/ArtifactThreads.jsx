import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ArtifactThreads({ publicId, kind, artifactId: artifactIdProp }) {
  const [artifactId, setArtifactId] = useState(artifactIdProp ?? null);

  useEffect(() => {
    if (artifactIdProp != null) setArtifactId(artifactIdProp);
  }, [artifactIdProp]);
  const [comments, setComments] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      try {
        if (artifactIdProp != null) {
          setArtifactId(artifactIdProp);
          const [c, a] = await Promise.all([
            api.artifactComments(artifactIdProp),
            api.approvals(artifactIdProp),
          ]);
          if (!cancelled) {
            setComments(c);
            setApprovals(a);
          }
          return;
        }
        const lu = await api.artifactLookup(publicId, kind);
        if (cancelled) return;
        const aid = lu.artifact?.id;
        setArtifactId(aid);
        if (!aid) return;
        const [c, a] = await Promise.all([api.artifactComments(aid), api.approvals(aid)]);
        if (!cancelled) {
          setComments(c);
          setApprovals(a);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId, kind, artifactIdProp]);

  async function refreshThreads(aid) {
    const [c, a] = await Promise.all([api.artifactComments(aid), api.approvals(aid)]);
    setComments(c);
    setApprovals(a);
  }

  async function addComment() {
    if (!artifactId || !text.trim()) return;
    setBusy(true);
    try {
      await api.postComment(artifactId, text.trim());
      setText('');
      await refreshThreads(artifactId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(decision) {
    if (!artifactId) return;
    setBusy(true);
    try {
      await api.postApproval(artifactId, decision);
      await refreshThreads(artifactId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (artifactIdProp == null && !publicId) return null;

  return (
    <div
      className="card"
      style={{ marginTop: '0.75rem', padding: '0.85rem', borderStyle: 'dashed' }}
    >
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Discussion & approvals · {publicId}</div>
      {error && (
        <p style={{ color: '#f87171', fontSize: '0.88rem' }} role="alert">
          {error}
        </p>
      )}
      {!artifactId && !error && (
        <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading artifact graph…</p>
      )}
      {artifactId && (
        <>
          <div style={{ marginBottom: '0.65rem' }}>
            <strong style={{ fontSize: '0.82rem' }}>Comments</strong>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
              {comments.map((c) => (
                <li key={c.id} style={{ marginBottom: '0.35rem' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                    <strong style={{ color: 'var(--text)' }}>
                      {c.author_name || (c.author_email ? c.author_email.split('@')[0] : 'User')}
                    </strong>{' '}
                    · {c.created_at}{' '}
                    {c.resolved ? (
                      <span className="badge badge-ok">resolved</span>
                    ) : (
                      <button
                        type="button"
                        style={{ fontSize: '0.75rem', marginLeft: 6 }}
                        onClick={async () => {
                          await api.resolveComment(c.id, true);
                          await refreshThreads(artifactId);
                        }}
                      >
                        Resolve
                      </button>
                    )}
                  </span>
                  <div style={{ marginTop: 2 }}>{c.body}</div>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="field-input"
                style={{ flex: 1 }}
                placeholder="Add a comment…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button type="button" className="btn-primary" disabled={busy} onClick={addComment}>
                Post
              </button>
            </div>
          </div>
          <div>
            <strong style={{ fontSize: '0.82rem' }}>Approvals</strong>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
              {approvals.map((a) => (
                <li key={a.id}>
                  {a.decision} by {a.approver_name || a.approver_email} · {a.signature_hash?.slice(0, 12)}…
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => approve('approve')}>
                Approve current version
              </button>
              <button type="button" disabled={busy} onClick={() => approve('reject')}>
                Reject
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
