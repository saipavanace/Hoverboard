import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { api } from '../api.js';

export default function Diagnostics() {
  const { key } = useParams();
  const [sig, setSig] = useState(null);

  useEffect(() => {
    if (!key) return;
    api
      .signatureDetail(key)
      .then(setSig)
      .catch(() => setSig(null));
  }, [key]);

  const histogram = [
    { d: 'T-6', n: 2 },
    { d: 'T-5', n: 1 },
    { d: 'T-4', n: 3 },
    { d: 'T-3', n: 2 },
    { d: 'T-2', n: 4 },
    { d: 'T-1', n: 3 },
    { d: 'Today', n: sig?.total ? Math.min(8, sig.total) : 1 },
  ];

  return (
    <>
      <Link to="/signatures" style={{ fontSize: '0.88rem' }}>
        ← Signatures
      </Link>
      <h1 className="page-title" style={{ marginTop: '0.65rem' }}>
        Error diagnostics
      </h1>
      <p className="page-lede">
        Drill into a signature: histogram of hits, linked rules/issues, assignees, and immutable
        activity — parity-plus with classic triage tools.
      </p>

      {!sig ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-open">{sig.state}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>{sig.signature_key}</span>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.35rem' }}>
              {sig.title}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: '0.35rem' }}>
              Total hits: {sig.total}. Category {sig.category || 'n/a'} · class {sig.class || 'n/a'}
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Last 30 days (illustrative)</div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={histogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="d" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="n" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>
              Signature activity ({sig.activity?.length || 0})
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Reference</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {(sig.activity || []).map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{a.at}</td>
                      <td>{a.action}</td>
                      <td>{a.reference}</td>
                      <td>
                        <span className="badge badge-open">{a.state}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!sig.activity?.length && (
              <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>No activity rows yet.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
