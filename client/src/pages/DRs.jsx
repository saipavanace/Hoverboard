import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS_OPTIONS = ['open', 'review', 'closed'];
const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

export default function DRs() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    status: '',
    priority: '',
  });

  useEffect(() => {
    api.config().then((c) => setCategories(c.requirementCategories || []));
  }, []);

  useEffect(() => {
    api
      .drs(filters)
      .then(setRows)
      .catch(() => setRows([]));
  }, [filters.q, filters.category, filters.status, filters.priority]);

  return (
    <>
      <h1 className="page-title">Design requirements</h1>
      <p className="page-lede">
        DRs are categorized and labeled for filtering. Search matches ID, excerpt, labels, or
        category text.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Filters</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.65rem',
            alignItems: 'end',
          }}
        >
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Search</div>
            <input
              className="field-input"
              value={filters.q}
              placeholder="Keywords…"
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Category</div>
            <select
              className="field-input"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Status</div>
            <select
              className="field-input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Priority</div>
            <select
              className="field-input"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            >
              <option value="">All</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Category</th>
              <th>Labels</th>
              <th>Spec</th>
              <th>Version</th>
              <th>Excerpt</th>
              <th>Status</th>
              <th>Prio</th>
              <th>Stale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{r.public_id}</td>
                <td>{r.category || '—'}</td>
                <td>{(r.labels || []).join(', ') || '—'}</td>
                <td>{r.spec_identifier}</td>
                <td>{r.spec_version_label}</td>
                <td>{r.excerpt?.slice(0, 100)}{r.excerpt?.length > 100 ? '…' : ''}</td>
                <td>{r.status || '—'}</td>
                <td>{r.priority || '—'}</td>
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
        <p style={{ color: 'var(--muted)' }}>No DRs match the current filters.</p>
      )}
    </>
  );
}
