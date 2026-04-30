import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function DRs() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.drs().then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <>
      <h1 className="page-title">Design requirements</h1>
      <p className="page-lede">
        DRs capture excerpts from specs with stable IDs. When a spec version no longer contains the
        excerpt, the DR is marked stale with consistent highlighting through linked VRs.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Spec</th>
              <th>Version</th>
              <th>Excerpt</th>
              <th>ASIL</th>
              <th>Stale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{r.public_id}</td>
                <td>{r.spec_identifier}</td>
                <td>{r.spec_version_label}</td>
                <td>{r.excerpt?.slice(0, 120)}{r.excerpt?.length > 120 ? '…' : ''}</td>
                <td>{r.asil || '—'}</td>
                <td>
                  {r.stale ? (
                    <span className="badge badge-stale">Stale</span>
                  ) : (
                    <span className="badge badge-ok">Current</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p style={{ color: 'var(--muted)' }}>No DRs yet — create one from the Specs viewer.</p>
      )}
    </>
  );
}
