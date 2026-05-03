import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectPath } from '../lib/paths.js';
import { api } from '../api.js';
import { buildCategoryTree, categoryOptionsFromConfig } from '../lib/requirementCategories.js';
import CategoryCascadeFilter from '../components/CategoryCascadeFilter.jsx';
import ArtifactThreads from '../components/ArtifactThreads.jsx';

const STATUS_OPTIONS = ['draft', 'ready', 'in verification', 'blocked', 'done', 'closed'];
const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];
const KIND_OPTIONS = [
  { value: 'VR', label: 'VR — verification requirement' },
  { value: 'SR', label: 'SR — stimulus requirement' },
  { value: 'CR', label: 'CR — coverage requirement' },
  { value: 'AR', label: 'AR — assertion requirement' },
];

const FILTER_FIELD_STYLE = { display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: 0 };

export default function VRs() {
  const { projectId } = useParams();
  const [vrs, setVrs] = useState([]);
  const [deleteErr, setDeleteErr] = useState('');
  const [allDrs, setAllDrs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilterRoots, setCategoryFilterRoots] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    kind: '',
    category: '',
    status: '',
    priority: '',
  });
  const [form, setForm] = useState({
    kind: 'VR',
    title: '',
    description: '',
    category: '',
    labels: '',
    status: 'draft',
    priority: 'P2',
    owner: '',
    location_scope: '',
  });
  const [linkedDrIds, setLinkedDrIds] = useState([]);
  const [drSearch, setDrSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drPickerFeedback, setDrPickerFeedback] = useState('');
  const [selectedVrPublicId, setSelectedVrPublicId] = useState(null);

  useEffect(() => {
    api.vrs(filters).then(setVrs).catch(() => setVrs([]));
  }, [filters]);

  useEffect(() => {
    Promise.all([api.drs(), api.config()])
      .then(([d, cfg]) => {
        setAllDrs(d);
        const cats = categoryOptionsFromConfig(cfg);
        setCategories(cats);
        setCategoryFilterRoots(buildCategoryTree(cfg.requirementCategories || []));
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

  function attemptLinkTypedDr() {
    const raw = drSearch.trim();
    setDrPickerFeedback('');
    if (!raw) return;

    const alreadyLinked = linkedDrIds.some((id) => id.toLowerCase() === raw.toLowerCase());
    if (alreadyLinked) {
      setDrPickerFeedback('This DR is already linked.');
      return;
    }

    const exact = allDrs.find((d) => d.public_id.toLowerCase() === raw.toLowerCase());
    if (exact && !linkedDrIds.includes(exact.public_id)) {
      addDr(exact.public_id);
      return;
    }

    if (drChoices.length === 1) {
      addDr(drChoices[0].public_id);
      return;
    }

    if (drChoices.length > 1) {
      setDrPickerFeedback('Multiple matches — choose from the list or type the full DR ID.');
      return;
    }

    setDrPickerFeedback('Not found. That DR does not exist — create it first or check the ID.');
  }

  const canSave = form.title.trim() && form.category && linkedDrIds.length > 0;

  return (
    <>
      <h1 className="page-title">Verification requirements</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Create verification requirement</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.65rem',
            alignItems: 'start',
          }}
        >
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Type *</div>
            <select
              className="field-input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Title *</div>
            <input
              className="field-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label style={{ ...FILTER_FIELD_STYLE, gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Description</div>
            <textarea
              className="field-input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Category *</div>
            <CategoryCascadeFilter
              showHeaderLabel={false}
              hideRootClear
              roots={categoryFilterRoots}
              value={form.category}
              onChange={(category) =>
                setForm((prev) => ({ ...prev, category }))
              }
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Labels (comma-separated)</div>
            <input
              className="field-input"
              value={form.labels}
              placeholder="lint, safety, pcie"
              onChange={(e) => setForm({ ...form, labels: e.target.value })}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
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
          <label style={FILTER_FIELD_STYLE}>
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
              placeholder="Type to filter, or full DR ID — press Enter to add"
              aria-invalid={Boolean(drPickerFeedback)}
              onChange={(e) => {
                setDrSearch(e.target.value);
                setDrPickerFeedback('');
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 180)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  attemptLinkTypedDr();
                }
              }}
            />
            {pickerOpen && drSearch.trim() && (
              <div className="dr-picker-panel" role="listbox">
                {drChoices.length > 0 ? (
                  drChoices.map((d) => (
                    <button
                      key={d.public_id}
                      type="button"
                      className="dr-picker-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        addDr(d.public_id);
                        setDrPickerFeedback('');
                      }}
                    >
                      <strong>{d.public_id}</strong>{' '}
                      <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                        {(d.excerpt || '').slice(0, 80)}
                        {(d.excerpt || '').length > 80 ? '…' : ''}
                      </span>
                    </button>
                  ))
                ) : (
                  <div
                    style={{
                      padding: '0.65rem',
                      fontSize: '0.85rem',
                      color: 'var(--muted)',
                    }}
                  >
                    No matching DRs in this filter.
                  </div>
                )}
              </div>
            )}
            {drPickerFeedback && (
              <p
                role="alert"
                style={{
                  margin: '0.35rem 0 0',
                  fontSize: '0.85rem',
                  color: 'var(--danger)',
                }}
              >
                {drPickerFeedback}
              </p>
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
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: '0.85rem', opacity: canSave ? 1 : 0.45 }}
          disabled={!canSave}
          onClick={async () => {
            await api.createVr({
              kind: form.kind,
              title: form.title,
              description: form.description,
              category: form.category,
              labels: form.labels,
              status: form.status,
              priority: form.priority,
              owner: form.owner || undefined,
              location_scope: form.location_scope || undefined,
              drPublicIds: linkedDrIds,
            });
            setForm({
              ...form,
              kind: 'VR',
              title: '',
              description: '',
              labels: '',
            });
            setLinkedDrIds([]);
            refreshAfterSave();
          }}
        >
          Save requirement
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Filters</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.65rem',
            alignItems: 'start',
          }}
        >
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Search</div>
            <input
              className="field-input"
              value={filters.q}
              placeholder="Keywords…"
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Type</div>
            <select
              className="field-input"
              value={filters.kind}
              onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
            >
              <option value="">All</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.value}
                </option>
              ))}
            </select>
          </label>
          <label style={FILTER_FIELD_STYLE}>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Category</div>
            <CategoryCascadeFilter
              key={filters.category || 'category-filter-all'}
              showHeaderLabel={false}
              roots={categoryFilterRoots}
              value={filters.category}
              onChange={(category) =>
                setFilters((prev) => ({ ...prev, category }))
              }
            />
          </label>
          <label style={FILTER_FIELD_STYLE}>
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
          <label style={FILTER_FIELD_STYLE}>
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

      {deleteErr && (
        <p style={{ color: '#f87171', marginBottom: '0.75rem' }} role="alert">
          {deleteErr}
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>ID</th>
              <th>Title</th>
              <th>Covered (logs)</th>
              <th>Tests (logs)</th>
              <th>Category</th>
              <th>Labels</th>
              <th>Status</th>
              <th>Prio</th>
              <th>Linked DRs</th>
              <th>Stale</th>
              <th>Artifact</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vrs.map((v) => (
              <tr
                key={v.id}
                style={{
                  cursor: 'pointer',
                  background:
                    selectedVrPublicId === v.public_id ? 'rgba(20,184,166,0.08)' : undefined,
                }}
                onClick={() =>
                  setSelectedVrPublicId((cur) => (cur === v.public_id ? null : v.public_id))
                }
              >
                <td>{v.kind || v.vr_kind || 'VR'}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem' }}>{v.public_id}</td>
                <td>{v.title}</td>
                <td>
                  {v.covered ? (
                    <span className="badge badge-ok" title={`${v.coverage_hits || 0} mention(s) in logs`}>
                      Yes
                    </span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>No</span>
                  )}
                </td>
                <td
                  style={{ fontSize: '0.78rem', maxWidth: 220 }}
                  title={(v.tests_from_logs || []).join(', ') || (v.regression_logs || []).map((x) => x.path).join('\n')}
                >
                  {(v.tests_from_logs || []).length > 0
                    ? `${(v.tests_from_logs || []).length}: ${(v.tests_from_logs || []).slice(0, 3).join(', ')}${
                        (v.tests_from_logs || []).length > 3 ? '…' : ''
                      }`
                    : v.regression_log_count > 0
                      ? `${v.regression_log_count} log file(s)`
                      : '—'}
                </td>
                <td>{v.category || '—'}</td>
                <td>{(v.labels || []).join(', ') || '—'}</td>
                <td>{v.status}</td>
                <td>{v.priority || '—'}</td>
                <td>{(v.linked_dr_public_ids || []).join(', ') || '—'}</td>
                <td>
                  {v.orphan_stale ? (
                    <span className="badge badge-stale" title={v.stale_reason || ''}>
                      Orphan
                    </span>
                  ) : v.stale_from_dr ? (
                    <span className="badge badge-stale">Stale chain</span>
                  ) : (
                    <span className="badge badge-ok">Clean</span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {v.artifact_id ? (
                    <Link
                      to={projectPath(Number(projectId), `artifacts/${v.artifact_id}`)}
                      style={{ fontSize: '0.82rem' }}
                    >
                      Open
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.2rem 0.45rem',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: '#f87171',
                      cursor: 'pointer',
                    }}
                    onClick={async () => {
                      setDeleteErr('');
                      if (
                        !window.confirm(
                          `Permanently delete ${v.public_id}? This cannot be undone.`
                        )
                      )
                        return;
                      try {
                        await api.deleteVr(v.public_id);
                        setVrs(await api.vrs(filters));
                        if (selectedVrPublicId === v.public_id) setSelectedVrPublicId(null);
                      } catch (err) {
                        setDeleteErr(err.message || 'Delete failed');
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!vrs.length && (
        <p style={{ color: 'var(--muted)' }}>No VRs match the current filters.</p>
      )}
      <ArtifactThreads publicId={selectedVrPublicId} kind="VR" />
    </>
  );
}
