import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import PdfViewer from '../components/PdfViewer.jsx';

const PERSIST_KEY = 'hoverboard.specs.activeSelection';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? JSON.parse(raw) : { specId: null, vid: null, viewerShown: false };
  } catch {
    return { specId: null, vid: null, viewerShown: false };
  }
}

function persist(state) {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function buildFolderTree(specs) {
  const root = { name: '', children: new Map(), specs: [] };
  for (const s of specs) {
    const parts = (s.folder_path || '').split('/').filter(Boolean);
    let node = root;
    for (const p of parts) {
      if (!node.children.has(p)) node.children.set(p, { name: p, children: new Map(), specs: [] });
      node = node.children.get(p);
    }
    node.specs.push(s);
  }
  return root;
}

export default function Specs() {
  const persisted = useRef(loadPersisted()).current;
  const [specs, setSpecs] = useState([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [folderPath, setFolderPath] = useState('');

  const [pickSpec, setPickSpec] = useState(null);
  const [versionLabel, setVersionLabel] = useState('1.0');
  const [file, setFile] = useState(null);

  const [activeVid, setActiveVid] = useState(persisted.vid);
  const [viewerShown, setViewerShown] = useState(Boolean(persisted.viewerShown));
  const [detail, setDetail] = useState(null);
  const [html, setHtml] = useState(null);

  const [selection, setSelection] = useState('');
  const [selectionRect, setSelectionRect] = useState(null);
  const viewerRef = useRef(null);

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [categories, setCategories] = useState([]);
  const [drModal, setDrModal] = useState(null);
  const [drNextId, setDrNextId] = useState('—');

  function load(q) {
    return api
      .specs(q ? { q } : undefined)
      .then((rows) => {
        setSpecs(rows);
        if (persisted.specId && !pickSpec) {
          const found = rows.find((s) => s.id === persisted.specId);
          if (found) setPickSpec(found);
        }
        return rows;
      })
      .catch(() => setSpecs([]));
  }

  useEffect(() => {
    load(search);
    api.config().then((cfg) => setCategories(cfg.requirementCategories || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search-driven
  }, [search]);

  useEffect(() => {
    persist({ specId: pickSpec?.id || null, vid: activeVid, viewerShown });
  }, [pickSpec, activeVid, viewerShown]);

  useEffect(() => {
    if (!viewerShown || !activeVid) {
      setDetail(null);
      setHtml(null);
      return;
    }
    api.specVersion(activeVid).then(setDetail).catch(() => setDetail(null));
    api.specVersionHtml(activeVid).then((r) => setHtml(r.html)).catch(() => setHtml(null));
  }, [viewerShown, activeVid]);

  function pickSpecAndAutoVersion(s) {
    setPickSpec(s);
    setViewerShown(false);
    const latest = s?.versions?.[0];
    setActiveVid(latest ? latest.id : null);
  }

  function onMouseUpViewer() {
    const sel = window.getSelection?.()?.toString()?.trim() || '';
    setSelection(sel);
    if (!sel || !viewerRef.current) {
      setSelectionRect(null);
      return;
    }
    try {
      const range = window.getSelection()?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      const wrap = viewerRef.current.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        setSelectionRect({
          top: Math.max(0, rect.top - wrap.top - 40),
          left: Math.max(0, rect.left - wrap.left + 4),
        });
      } else {
        setSelectionRect(null);
      }
    } catch {
      setSelectionRect(null);
    }
  }

  async function openCreateDrModal() {
    if (!selection || !activeVid || !detail) return;
    let nextId = '—';
    try {
      const peek = await api.drPeek();
      nextId = peek.next_public_id;
    } catch {
      /* ignore */
    }
    setDrNextId(nextId);
    setDrModal({
      excerpt: selection,
      description: '',
      comments: '',
      category: categories[0] || '',
      labels: '',
      status: 'open',
      priority: '',
      spec_reference: `${pickSpec?.name || ''} · v${detail.version} · ${pickSpec?.identifier || ''}`,
    });
  }

  async function saveDr() {
    if (!drModal || !drModal.excerpt?.trim() || !drModal.category) return;
    await api.createDr({
      specVersionId: activeVid,
      excerpt: drModal.excerpt,
      description: drModal.description || undefined,
      comments: drModal.comments || undefined,
      category: drModal.category,
      labels: drModal.labels || undefined,
      status: drModal.status,
      priority: drModal.priority || undefined,
      spec_reference: drModal.spec_reference,
    });
    setDrModal(null);
    setSelection('');
    setSelectionRect(null);
    window.getSelection()?.removeAllRanges();
  }

  const tree = useMemo(() => buildFolderTree(specs), [specs]);

  return (
    <>
      <h1 className="page-title">Specifications</h1>
      <p className="page-lede">
        Upload PDF or Word into folders. The viewer is hidden by default — click <strong>View
        spec</strong> to load it. Select text in the viewer to capture a DR with full metadata.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>New specification</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Name</div>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ minWidth: 220 }}
              placeholder="PCIe controller"
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Identifier</div>
            <input
              className="field-input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              style={{ minWidth: 200 }}
              placeholder="SPEC-PCIE"
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Folder (slashes for nesting)</div>
            <input
              className="field-input"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              style={{ minWidth: 240 }}
              placeholder="System / Subsystem"
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              await api.createSpec({ name, identifier, folder_path: folderPath });
              setName('');
              setIdentifier('');
              setFolderPath('');
              load(search);
            }}
          >
            Create
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 360px) 1fr',
          gap: '1rem',
        }}
      >
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Catalog</div>
          <input
            className="field-input"
            placeholder="Search specs by name or identifier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: '0.65rem' }}
          />
          <FolderTree node={tree} pickSpec={pickSpec} onPick={pickSpecAndAutoVersion} />
          {!specs.length && (
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No specs match.</div>
          )}
        </div>

        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.65rem',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontWeight: 700 }}>Active spec</div>
            {pickSpec && (
              <button
                type="button"
                className="btn-ghost"
                style={{ color: 'var(--danger)' }}
                onClick={() => setDeleteConfirm(pickSpec)}
              >
                Delete spec…
              </button>
            )}
          </div>
          {!pickSpec ? (
            <div style={{ color: 'var(--muted)' }}>Select a specification from the catalog.</div>
          ) : (
            <>
              <div style={{ marginBottom: '0.65rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{pickSpec.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{pickSpec.identifier}</span>
                  {pickSpec.folder_path ? ` · ${pickSpec.folder_path}` : ''}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.65rem',
                  alignItems: 'end',
                }}
              >
                <label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Version label</div>
                  <input
                    className="field-input"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>File (.pdf / .docx)</div>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => setFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    if (!file) return;
                    const res = await api.uploadVersion(pickSpec.id, versionLabel, file);
                    alert(`Uploaded. Change summary: ${res.changelog?.summary || 'n/a'}`);
                    const refreshed = await api.specs(search ? { q: search } : undefined);
                    setSpecs(refreshed);
                    const self = refreshed.find((x) => x.id === pickSpec.id);
                    setPickSpec(self || null);
                    setActiveVid(self?.versions?.[0]?.id || null);
                    setViewerShown(false);
                  }}
                >
                  Upload
                </button>
              </div>

              <div style={{ marginTop: '1rem', fontWeight: 700 }}>Versions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {pickSpec.versions?.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setActiveVid(v.id);
                      setViewerShown(false);
                    }}
                    style={{
                      borderColor: activeVid === v.id ? 'rgba(20,184,166,0.5)' : undefined,
                    }}
                  >
                    {v.version} · {v.original_filename || 'file'}
                  </button>
                ))}
              </div>

              {activeVid && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: '0.85rem' }}
                  onClick={() => setViewerShown((s) => !s)}
                >
                  {viewerShown ? 'Hide spec' : 'View spec'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {viewerShown && detail && (
        <div className="card" style={{ marginTop: '1rem', position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>Viewer (read-only)</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Select text — a <em>Create DR</em> button will appear next to the selection.
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setViewerShown(false)}>
              Hide
            </button>
          </div>

          <div ref={viewerRef} style={{ position: 'relative', marginTop: '0.5rem' }}>
            {detail.mime_type === 'application/pdf' ||
            detail.original_filename?.toLowerCase().endsWith('.pdf') ? (
              <PdfViewer fileUrl={detail.fileUrl} onMouseUp={onMouseUpViewer} />
            ) : html ? (
              <div
                className="doc-viewer readonly doc-html"
                onMouseUp={onMouseUpViewer}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div style={{ color: 'var(--muted)' }}>
                Preview unavailable for this file type.
              </div>
            )}

            {selection && selectionRect && (
              <div
                style={{
                  position: 'absolute',
                  top: selectionRect.top,
                  left: selectionRect.left,
                  zIndex: 5,
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button type="button" className="btn-primary" onClick={openCreateDrModal}>
                  Create DR
                </button>
              </div>
            )}
          </div>

          {detail.changelog && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                Change list — {detail.changelog.summary}
              </summary>
              <pre
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  background: 'rgba(0,0,0,0.35)',
                  borderRadius: 8,
                  overflow: 'auto',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--mono)',
                }}
              >
                {JSON.stringify(detail.changelog, null, 2).slice(0, 4000)}
              </pre>
            </details>
          )}
        </div>
      )}

      {drModal && (
        <DrModal
          state={drModal}
          setState={setDrModal}
          onClose={() => setDrModal(null)}
          onSave={saveDr}
          categories={categories}
          drNextId={drNextId}
        />
      )}

      {deleteConfirm && (
        <ConfirmDelete
          spec={deleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={async () => {
            try {
              await api.deleteSpec(deleteConfirm.id);
              setDeleteConfirm(null);
              setPickSpec(null);
              setActiveVid(null);
              setViewerShown(false);
              setDetail(null);
              setHtml(null);
              persist({ specId: null, vid: null, viewerShown: false });
              load(search);
            } catch (e) {
              alert(`Delete failed: ${e.message}`);
            }
          }}
        />
      )}
    </>
  );
}

function ConfirmDelete({ spec, onCancel, onConfirm }) {
  const [text, setText] = useState('');
  const matches = text.trim() === spec.identifier;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card" style={{ width: 'min(520px, 100%)' }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Delete this specification?</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          This permanently removes <strong>{spec.name}</strong> (
          <span style={{ fontFamily: 'var(--mono)' }}>{spec.identifier}</span>), all its uploaded
          versions, files on disk, and every <strong>DR</strong> created from it (along with
          their VR links). This cannot be undone.
        </p>
        <label>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            Type the identifier <strong>{spec.identifier}</strong> to confirm:
          </div>
          <input
            className="field-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </label>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '1rem',
          }}
        >
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!matches}
            style={{
              background: matches
                ? 'linear-gradient(135deg, #f97373, #b91c1c)'
                : undefined,
              color: matches ? '#fff' : undefined,
              opacity: matches ? 1 : 0.5,
            }}
            onClick={onConfirm}
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderTree({ node, pickSpec, onPick, depth = 0 }) {
  const folders = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {folders.map((f) => (
        <Folder key={`${depth}-${f.name}`} node={f} pickSpec={pickSpec} onPick={onPick} depth={depth + 1} />
      ))}
      {node.specs.map((s) => (
        <button
          key={s.id}
          type="button"
          className="btn-ghost"
          onClick={() => onPick(s)}
          style={{
            justifyContent: 'space-between',
            display: 'flex',
            marginLeft: depth * 12,
            borderColor: pickSpec?.id === s.id ? 'rgba(20,184,166,0.5)' : undefined,
          }}
        >
          <span style={{ fontSize: '0.88rem' }}>{s.name}</span>
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.74rem' }}>
            {s.identifier}
          </span>
        </button>
      ))}
    </div>
  );
}

function Folder({ node, pickSpec, onPick, depth }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          marginLeft: (depth - 1) * 12,
          fontWeight: 600,
          fontSize: '0.85rem',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {open ? '▾' : '▸'} {node.name}
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          <FolderTree node={node} pickSpec={pickSpec} onPick={onPick} depth={depth} />
        </div>
      )}
    </div>
  );
}

function DrModal({ state, setState, onClose, onSave, categories, drNextId }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{ width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Create design requirement</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Auto-assigned ID: <span style={{ fontFamily: 'var(--mono)' }}>{drNextId}</span>
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.65rem',
            marginTop: '0.85rem',
          }}
        >
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Spec text *</div>
            <textarea
              className="field-input"
              rows={4}
              value={state.excerpt}
              onChange={(e) => setState({ ...state, excerpt: e.target.value })}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Spec reference (auto)</div>
            <input className="field-input" value={state.spec_reference} readOnly />
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.65rem',
            }}
          >
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Category *</div>
              <select
                className="field-input"
                value={state.category}
                onChange={(e) => setState({ ...state, category: e.target.value })}
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
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Labels</div>
              <input
                className="field-input"
                placeholder="lint, safety"
                value={state.labels}
                onChange={(e) => setState({ ...state, labels: e.target.value })}
              />
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Status</div>
              <select
                className="field-input"
                value={state.status}
                onChange={(e) => setState({ ...state, status: e.target.value })}
              >
                <option value="open">open</option>
                <option value="review">review</option>
                <option value="closed">closed</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Priority</div>
              <select
                className="field-input"
                value={state.priority}
                onChange={(e) => setState({ ...state, priority: e.target.value })}
              >
                <option value="">—</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </label>
          </div>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Description (optional)</div>
            <textarea
              className="field-input"
              rows={2}
              value={state.description}
              onChange={(e) => setState({ ...state, description: e.target.value })}
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Comments (optional)</div>
            <textarea
              className="field-input"
              rows={2}
              value={state.comments}
              onChange={(e) => setState({ ...state, comments: e.target.value })}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onSave}
            disabled={!state.excerpt?.trim() || !state.category}
            style={{ opacity: !state.excerpt?.trim() || !state.category ? 0.45 : 1 }}
          >
            Create DR
          </button>
        </div>
      </div>
    </div>
  );
}
