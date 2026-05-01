import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ArtifactThreads from '../components/ArtifactThreads.jsx';
import { projectPath } from '../lib/paths.js';

export default function ArtifactDetail() {
  const { projectId: routeProjectId, artifactId } = useParams();
  const pid = Number(routeProjectId);
  const aid = Number(artifactId);
  const [data, setData] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErr('');
    (async () => {
      try {
        const d = await api.artifactDetail(aid);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aid]);

  useEffect(() => {
    if (!Number.isFinite(pid) || !Number.isFinite(aid)) return;
    let cancelled = false;
    api
      .evidenceList(pid, { artifact_id: aid })
      .then((rows) => {
        if (!cancelled) setEvidence(rows);
      })
      .catch(() => {
        if (!cancelled) setEvidence([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pid, aid]);

  async function onFile(file) {
    if (!Number.isFinite(pid) || !file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('artifact_id', String(aid));
    const ver = data?.artifact?.current_version_id;
    if (ver) fd.append('artifact_version_id', String(ver));
    setBusy(true);
    setErr('');
    try {
      await api.evidenceUpload(pid, fd);
      const rows = await api.evidenceList(pid, { artifact_id: aid });
      setEvidence(rows);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const art = data?.artifact;
  const pub =
    data?.dr_public_id || data?.vr_public_id
      ? `${data?.dr_public_id ? 'DR' : 'VR'} ${data?.dr_public_id || data?.vr_public_id}`
      : null;

  return (
    <>
      <nav style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        <Link to={projectPath(pid, 'drs')} style={{ color: 'var(--muted)' }}>
          ← DRs
        </Link>
        {' · '}
        <Link to={projectPath(pid, 'vrs')} style={{ color: 'var(--muted)' }}>
          VRs
        </Link>
      </nav>
      <h1 className="page-title">{art?.title || art?.external_id || `Artifact #${aid}`}</h1>
      <p className="page-lede">
        {pub && <span>{pub} · </span>}
        Type {art?.artifact_type || '—'} · Project #{art?.project_id ?? '—'}
      </p>

      {err && (
        <p style={{ color: '#f87171' }} role="alert">
          {err}
        </p>
      )}

      {art && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Workspace</div>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
            Comments and approvals apply to the artifact; evidence rows can be pinned to the current version when
            uploaded.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Evidence</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.65rem' }}>
          Logs, exports, images (immutable records with SHA-256). Independence reviews (I2/I3) often rely on structured
          evidence attachments.
        </p>
        <label
          style={{
            display: 'block',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: '1rem',
            textAlign: 'center',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          <input
            type="file"
            disabled={busy || !Number.isFinite(pid)}
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onFile(f);
            }}
          />
          Drop or choose file (log, txt, pdf, csv, json, image…)
        </label>
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
          {evidence.map((e) => (
            <li key={e.id} style={{ marginBottom: '0.35rem' }}>
              <a
                href={api.evidenceDownloadUrl(pid, e.id)}
                target="_blank"
                rel="noreferrer"
                style={{ fontWeight: 600 }}
              >
                {e.file_name || 'file'}
              </a>
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                {e.created_at} · {e.file_hash?.slice(0, 12)}…
              </span>
            </li>
          ))}
        </ul>
        {!evidence.length && <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>No evidence linked yet.</p>}
      </div>

      <ArtifactThreads artifactId={aid} />
    </>
  );
}
