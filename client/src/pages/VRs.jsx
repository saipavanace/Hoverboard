import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const STATUS_OPTIONS = ['draft', 'ready', 'in verification', 'blocked', 'done', 'closed'];
const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

export default function VRs() {
  const [vrs, setVrs] = useState([]);
  const [allDrs, setAllDrs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    status: '',
    priority: '',
  });
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    labels: '',
    status: 'draft',
    priority: 'P2',
    owner: '',
    location_scope: '',
    asil: '',
    showIsoAsil: false,
  });
  const [linkedDrIds, setLinkedDrIds] = useState([]);
  const [drSearch, setDrSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    api.vrs(filters).then(setVrs).catch(() => setVrs([]));
  }, [filters]);

  useEffect(() => {
    Promise.all([api.drs(), api.config()])
      .then(([d, cfg]) => {
        setAllDrs(d);
        const cats = cfg.requirementCategories || [];
        setCategories(cats);
        setForm((f) => ({ ...f, category: f.category || cats[0] || '' }));
      })
      .catch(() => {});
  }, []);

  async function refreshAfterSave() {
    const [v, d] = await Promise.all([api.vrs(filters), api.drs()]);
    setVrs(v);
    setAllDrs(d);
  }

  const drChoices = useMemo(() => {
    const q = drSearch.trim().toLowerCase();
    return allDrs
      .filter((d) => !linkedDrIds.includes(d.public_id))
      .filter((d) => {
        if (!q) return true;
        return (
          d.public_id.toLowerCase().includes(q) ||
          String(d.excerpt || '')
            .toLowerCase()
            .includes(q)
        );
      })
      .slice(0, 40);
  }, [allDrs, linkedDrIds, drSearch]);

  function addDr(pid) {
    if (!linkedDrIds.includes(pid)) setLinkedDrIds((s) => [...s, pid]);
    setDrSearch('');
    setPickerOpen(false);
  }

  function removeDr(pid) {
    setLinkedDrIds((s) => s.filter((x) => x !== pid));
  }

  const canSave = form.title.trim() && form.category && linkedDrIds.length > 0;

  return (
    <>
      <h1 className="page-title">Verification requirements</h1>
      <p className="page-lede">
        VRs use categories and labels for navigation. Each VR must link to at least one{' '}
        <strong>existing</strong> DR — pick from the typeahead (unknown IDs cannot be saved). Optional
        ASIL is available under ISO reporting when needed.
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

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Create VR</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.65rem',
          }}
        >
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Title *</div>
            <input
              className="field-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Description</div>
            <textarea
              className="field-input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Category *</div>
            <select
              className="field-input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Labels (comma-separated)</div>
            <input
              className="field-input"
              value={form.labels}
              placeholder="lint, safety, pcie"
              onChange={(e) => setForm({ ...form, labels: e.target.value })}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Status</div>
            <select
              className="field-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
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
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Owner</div>
            <input
              className="field-input"
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Location / scope</div>
            <input
              className="field-input"
              value={form.location_scope}
              onChange={(e) => setForm({ ...form, location_scope: e.target.value })}
            />
          </label>

          <label style={{ gridColumn: '1 / -1' }} className="dr-picker">
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Linked DRs * (existing IDs only)
            </div>
            <input
              className="field-input"
              value={drSearch}
              placeholder="Type to filter DRs by ID or excerpt…"
              onChange={(e) => {
                setDrSearch(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 180)}
            />
            {pickerOpen && drChoices.length > 0 && (
              <div className="dr-picker-panel" role="listbox">
                {drChoices.map((d) => (
                  <button
                    key={d.public_id}
                    type="button"
                    className="dr-picker-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addDr(d.public_id)}
                  >
                    <strong>{d.public_id}</strong>{' '}
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                      {(d.excerpt || '').slice(0, 80)}
                      {(d.excerpt || '').length > 80 ? '…' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="dr-chip-wrap">
              {linkedDrIds.map((pid) => (
                <span key={pid} className="dr-chip">
                  {pid}
                  <button type="button" aria-label={`Remove ${pid}`} onClick={() => removeDr(pid)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </label>

          <div style={{ gridColumn: '1 / -1' }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
              onClick={() => setForm((f) => ({ ...f, showIsoAsil: !f.showIsoAsil }))}
            >
              {form.showIsoAsil ? '▼' : '▶'} ISO reporting (optional ASIL)
            </button>
            {form.showIsoAsil && (
              <label style={{ display: 'block', marginTop: '0.65rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>ASIL (traceability)</div>
                <input
                  className="field-input"
                  value={form.asil}
                  placeholder="ASIL-D"
                  onChange={(e) => setForm({ ...form, asil: e.target.value })}
                  style={{ maxWidth: 280 }}
                />
              </label>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: '0.85rem', opacity: canSave ? 1 : 0.45 }}
          disabled={!canSave}
          onClick={async () => {
            await api.createVr({
              title: form.title,
              description: form.description,
              category: form.category,
              labels: form.labels,
              status: form.status,
              priority: form.priority,
              owner: form.owner || undefined,
              location_scope: form.location_scope || undefined,
              asil: form.asil.trim() || undefined,
              drPublicIds: linkedDrIds,
            });
            setForm({
              ...form,
              title: '',
              description: '',
              labels: '',
              asil: '',
            });
            setLinkedDrIds([]);
            refreshAfterSave();
          }}
        >
          Save VR
        </button>
        {!canSave && (
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
            Title, category, and at least one linked DR are required.
          </p>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>VR ID</th>
              <th>Title</th>
              <th>Category</th>
              <th>Labels</th>
              <th>Status</th>
              <th>Prio</th>
              <th>Linked DRs</th>
              <th>Stale</th>
            </tr>
          </thead>
          <tbody>
            {vrs.map((v) => (
              <tr key={v.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{v.public_id}</td>
                <td>{v.title}</td>
                <td>{v.category || '—'}</td>
                <td>{(v.labels || []).join(', ') || '—'}</td>
                <td>{v.status}</td>
                <td>{v.priority || '—'}</td>
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

      {!vrs.length && (
        <p style={{ color: 'var(--muted)' }}>No VRs match the current filters.</p>
      )}
    </>
  );
}
