import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { projectPath } from '../lib/paths.js';

export default function ISO() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [audit, setAudit] = useState([]);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .config()
      .then((c) => {
        if (cancelled) return;
        if (c.iso26262Enabled !== true) {
          navigate(projectPath(Number(projectId), 'dashboard'), { replace: true });
          return;
        }
        api.isoAudit().then(setAudit).catch(() => setAudit([]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [navigate, projectId]);

  async function downloadTraceabilityCsv() {
    setCsvError('');
    setCsvBusy(true);
    try {
      const blob = await api.isoTraceabilityCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'traceability-matrix.csv';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setCsvError(
        e.status === 401
          ? 'Sign in is required. Your session may have expired.'
          : e.status === 403
            ? 'You do not have access to export for this project (need ISO read / viewer on the current project).'
            : e.status === 404
              ? 'ISO 26262 exports are disabled in server configuration.'
              : e.message || 'Download failed'
      );
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">ISO 26262 workspace</h1>
      <p className="page-lede">
        Traceability exports, ASIL tagging hooks on DR/VR, verification review placeholders, audit
        trail, and audit-ready bundles — structured for serious compliance workflows.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Exports</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)' }}>
          <li>
            <button
              type="button"
              onClick={downloadTraceabilityCsv}
              disabled={csvBusy}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent, #14b8a6)',
                cursor: csvBusy ? 'wait' : 'pointer',
                textDecoration: 'underline',
                font: 'inherit',
              }}
            >
              {csvBusy ? 'Preparing…' : 'Traceability matrix (CSV)'}
            </button>{' '}
            — VR ↔ DR mapping with stale flags (current project).
          </li>
          <li>Safety case templates & PDF bundles — wire to your document engine.</li>
          <li>Gap analysis: filter DR/VR without ASIL or missing linked evidence.</li>
        </ul>
        {csvError && (
          <p style={{ color: '#f87171', fontSize: '0.88rem', marginTop: '0.65rem', marginBottom: 0 }} role="alert">
            {csvError}
          </p>
        )}
      </div>

      <section className="grid-kpi" style={{ marginBottom: '1rem' }}>
        {[
          ['Safety plan', 'Draft checklist'],
          ['Verification review', 'Approver workflow'],
          ['Tool qualification', 'Evidence placeholders'],
          ['Audit trail', `${audit.length} events`],
        ].map(([t, s]) => (
          <div key={t} className="card">
            <div className="kpi-label">{t}</div>
            <div style={{ fontWeight: 600 }}>{s}</div>
          </div>
        ))}
      </section>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Audit log (recent)</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 40).map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{a.created_at}</td>
                  <td>
                    {a.entity_type} {a.entity_id}
                  </td>
                  <td>{a.action}</td>
                  <td>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
