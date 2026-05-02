import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from 'recharts';
import { api } from '../api.js';

const REQ_TILES = [
  { key: 'VR', code: 'VR', name: 'Verification', accent: '#14b8a6' },
  { key: 'SR', code: 'SR', name: 'Stimulus', accent: '#f59e0b' },
  { key: 'CR', code: 'CR', name: 'Coverage', accent: '#38bdf8' },
  { key: 'AR', code: 'AR', name: 'Assertion', accent: '#a78bfa' },
];

const trendSeed = [
  { day: 'Mon', pass: 91, fcov: 62 },
  { day: 'Tue', pass: 92, fcov: 63 },
  { day: 'Wed', pass: 90, fcov: 64 },
  { day: 'Thu', pass: 93, fcov: 66 },
  { day: 'Fri', pass: 94, fcov: 68 },
  { day: 'Sat', pass: 93, fcov: 69 },
  { day: 'Sun', pass: 94, fcov: 70 },
];

export default function Dashboard() {
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api
      .metrics()
      .then(setM)
      .catch((e) => setErr(String(e.message)));
  }, []);

  const rr = m?.releaseReadiness;
  const rq = m?.requirementCoverageByKind || {};

  return (
    <>
      <h1 className="page-title">Status dashboard</h1>
      <p className="page-lede">
        Program health at a glance: coverage mix, regression posture, signature load, and adaptive
        release readiness — inspired by verification ops dashboards, tuned for clarity.
      </p>

      {err && (
        <div className="card" style={{ borderColor: 'rgba(249,115,115,0.4)', marginBottom: '1rem' }}>
          API unreachable ({err}). Run <code>npm run dev</code> from repo root
          to start API + UI.
        </div>
      )}

      <section className="grid-kpi" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="kpi-label">Release score</div>
          <div className="kpi-value">{rr?.score ?? '—'}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
            {rr?.projectionNote}
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Pass rate (proxy)</div>
          <div className="kpi-value">{m?.passRate != null ? `${m.passRate}%` : '—'}</div>
        </div>
        <div className="card">
          <div className="kpi-label">Functional cov.</div>
          <div className="kpi-value">{m?.functionalCoverage ?? '—'}%</div>
        </div>
        <div className="card">
          <div className="kpi-label">DR health</div>
          <div className="kpi-value">{m?.drCoverage ?? '—'}%</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            {m?.drStale != null ? `${m.drStale} stale DRs` : ''}
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Signatures</div>
          <div className="kpi-value">{m?.regressionSignatures ?? '—'}</div>
        </div>
      </section>

      <section className="dashboard-req-section">
        <div className="dashboard-req-head">
          <div>
            <h2 className="dashboard-req-title">Verification requirement coverage</h2>
            <p className="dashboard-req-desc">
              Closure from regression log scans by requirement type. Each kind uses its own ID sequence (
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.84em' }}>VR‑*, SR‑*, CR‑*, AR‑*</span>
              ). The overall figure blends every linked item in this project.
            </p>
          </div>
          <div className="dashboard-req-overall">
            <span className="kpi-label">Overall</span>
            <div className="dashboard-req-overall-val">{m?.vrCoverage != null ? `${m.vrCoverage}%` : '—'}</div>
          </div>
        </div>
        <div className="dashboard-req-grid">
          {REQ_TILES.map(({ key, code, name, accent }) => {
            const row = rq[key] || { pct: 0, total: 0, covered: 0 };
            const pct = row.pct ?? 0;
            return (
              <div
                key={key}
                className="req-cov-tile"
                style={{ '--tile-accent': accent }}
              >
                <div className="req-cov-tile__kind">{code}</div>
                <div className="req-cov-tile__name">{name}</div>
                <div className="req-cov-tile__pct">{pct}%</div>
                <div className="req-cov-tile__meta">
                  {row.covered ?? 0} / {row.total ?? 0} with log hits
                </div>
                <div className="req-cov-tile__bar" aria-hidden>
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Trend — pass & coverage</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={trendSeed}>
                <defs>
                  <linearGradient id="gPass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis domain={[80, 100]} stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pass"
                  stroke="#14b8a6"
                  fillOpacity={1}
                  fill="url(#gPass)"
                  name="Pass %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
            Coverage mix — code & requirements
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart
                data={[
                  { name: 'Fn', v: m?.functionalCoverage ?? 0 },
                  { name: 'Code', v: m?.codeCoverage ?? 0 },
                  { name: 'VR', v: rq.VR?.pct ?? 0 },
                  { name: 'SR', v: rq.SR?.pct ?? 0 },
                  { name: 'CR', v: rq.CR?.pct ?? 0 },
                  { name: 'AR', v: rq.AR?.pct ?? 0 },
                  { name: 'DR', v: m?.drCoverage ?? 0 },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} interval={0} />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="v" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Release readiness</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
              Single management score + adaptive date with confidence (early phase stays TBD).
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Projected date</div>
            <div style={{ fontWeight: 700 }}>
              {rr?.projectedReleaseDate || 'TBD'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              confidence {rr?.confidence != null ? `${Math.round(rr.confidence * 100)}%` : '—'}
            </div>
          </div>
        </div>
        <div className="progress-bar" style={{ marginTop: '0.85rem' }}>
          <span style={{ width: `${Math.min(100, rr?.score ?? 0)}%` }} />
        </div>
      </section>

      <section className="card">
        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Insights</div>
        <ul style={{ margin: 0, paddingLeft: '1.15rem', color: 'var(--muted)', fontSize: '0.92rem' }}>
          <li>Temporal: spike detection on new signatures vs last sprint.</li>
          <li>Cross-block: heatmap of failures by subsystem (configure blocks in Settings).</li>
          <li>Ownership: assignment queue & shortest failing jobs for faster debug.</li>
          <li>Links: regressions ↔ DR/VR ↔ issue IDs ↔ commits (wire your trackers).</li>
        </ul>
      </section>
    </>
  );
}
