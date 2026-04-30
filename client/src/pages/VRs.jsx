import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function VRs() {
  const [vrs, setVrs] = useState([]);
  const [drs, setDrs] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'draft',
    priority: 'P2',
    owner: '',
    location_scope: '',
    verification_method: 'simulation',
    milestone_gate: 'DV',
    asil: 'ASIL-B',
    drPublicIds: '',
  });

  async function refresh() {
    const [v, d] = await Promise.all([api.vrs(), api.drs()]);
    setVrs(v);
    setDrs(d);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  return (
    <>
      <h1 className="page-title">Verification requirements</h1>
      <p className="page-lede">
        VRs carry full metadata and link to one or many DRs via public IDs. Linked VRs inherit stale
        signaling when any attached DR goes stale.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Create VR</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.65rem',
          }}
        >
          {[
            ['title', 'Title'],
            ['description', 'Description'],
            ['status', 'Status'],
            ['priority', 'Priority'],
            ['owner', 'Owner'],
            ['location_scope', 'Location / scope'],
            ['verification_method', 'Method'],
            ['milestone_gate', 'Gate'],
            ['asil', 'ASIL'],
          ].map(([key, label]) => (
            <label key={key}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{label}</div>
              <input
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                style={input}
              />
            </label>
          ))}
          <label style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Linked DR IDs (comma-separated public IDs)
            </div>
            <input
              value={form.drPublicIds}
              onChange={(e) => setForm({ ...form, drPublicIds: e.target.value })}
              style={input}
              placeholder="DR-00001, DR-00002"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: '0.75rem' }}
          onClick={async () => {
            const ids = form.drPublicIds
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            await api.createVr({
              title: form.title,
              description: form.description,
              status: form.status,
              priority: form.priority,
              owner: form.owner,
              location_scope: form.location_scope,
              verification_method: form.verification_method,
              milestone_gate: form.milestone_gate,
              asil: form.asil,
              drPublicIds: ids,
            });
            setForm({
              ...form,
              title: '',
              description: '',
              drPublicIds: '',
            });
            refresh();
          }}
        >
          Save VR
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>VR ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Method</th>
              <th>Linked DRs</th>
              <th>Stale (via DR)</th>
            </tr>
          </thead>
          <tbody>
            {vrs.map((v) => (
              <tr key={v.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{v.public_id}</td>
                <td>{v.title}</td>
                <td>{v.status}</td>
                <td>{v.verification_method}</td>
                <td>{(v.linked_dr_public_ids || []).join(', ') || '—'}</td>
                <td>
                  {v.stale_from_dr ? (
                    <span className="badge badge-stale">Stale chain</span>
                  ) : (
                    <span className="badge badge-ok">Clean</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Available DR IDs for linking:{' '}
        <span style={{ fontFamily: 'var(--mono)' }}>
          {drs.map((d) => d.public_id).join(', ') || '—'}
        </span>
      </div>
    </>
  );
}

const input = {
  width: '100%',
  padding: '0.45rem 0.65rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(0,0,0,0.25)',
  color: 'var(--text)',
};
