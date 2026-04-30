import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ISO() {
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    api.isoAudit().then(setAudit).catch(() => setAudit([]));
  }, []);

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
            <a href="/api/iso/traceability.csv" download>
              Traceability matrix (CSV)
            </a>{' '}
            — VR ↔ DR mapping with stale flags.
          </li>
          <li>Safety case templates & PDF bundles — wire to your document engine.</li>
          <li>Gap analysis: filter DR/VR without ASIL or missing linked evidence.</li>
        </ul>
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
