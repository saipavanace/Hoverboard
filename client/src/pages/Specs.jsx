import { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';

export default function Specs() {
  const [specs, setSpecs] = useState([]);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [pickSpec, setPickSpec] = useState(null);
  const [versionLabel, setVersionLabel] = useState('1.0');
  const [file, setFile] = useState(null);
  const [activeVid, setActiveVid] = useState(null);
  const [detail, setDetail] = useState(null);
  const [html, setHtml] = useState(null);
  const [selection, setSelection] = useState('');
  const [floatPos, setFloatPos] = useState(null);
  const viewerRef = useRef(null);

  const load = () =>
    api.specs().then(setSpecs).catch(() => setSpecs([]));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!activeVid) {
      setDetail(null);
      setHtml(null);
      return;
    }
    api.specVersion(activeVid).then(setDetail).catch(() => {});
    api
      .specVersionHtml(activeVid)
      .then((r) => setHtml(r.html))
      .catch(() => setHtml(null));
  }, [activeVid]);

  function onMouseUpViewer() {
    const sel = window.getSelection?.()?.toString()?.trim() || '';
    setSelection(sel);
    if (!sel || !viewerRef.current) {
      setFloatPos(null);
      return;
    }
    const range = window.getSelection()?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (rect) setFloatPos({ top: rect.top + window.scrollY - 48, left: rect.left + window.scrollX });
  }

  async function createDr() {
    if (!activeVid || !selection) return;
    await api.createDr({
      specVersionId: activeVid,
      excerpt: selection,
      anchor_hint: 'selection',
    });
    setSelection('');
    setFloatPos(null);
    window.getSelection()?.removeAllRanges();
    alert('DR created from selection.');
  }

  return (
    <>
      <h1 className="page-title">Specifications</h1>
      <p className="page-lede">
        Upload PDF or Word; documents are read-only in-app. New versions get an automatic change list;
        impacted DRs / linked VRs surface as stale when excerpts no longer match.
      </p>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>New specification</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="PCIe controller"
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Identifier</div>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              style={inputStyle}
              placeholder="SPEC-PCIE"
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              await api.createSpec({ name, identifier });
              setName('');
              setIdentifier('');
              load();
            }}
          >
            Create
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Catalog</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {specs.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn-ghost"
                style={{ justifyContent: 'space-between', display: 'flex' }}
                onClick={() => setPickSpec(s)}
              >
                <span>{s.name}</span>
                <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>
                  {s.identifier}
                </span>
              </button>
            ))}
            {!specs.length && (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No specs yet.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.65rem' }}>Upload version</div>
          {!pickSpec ? (
            <div style={{ color: 'var(--muted)' }}>Select a specification.</div>
          ) : (
            <>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Active: <strong>{pickSpec.name}</strong>
              </div>
              <label>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Version label</div>
                <input
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'block', marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>File (.pdf / .docx)</div>
                <input type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files?.[0])} />
              </label>
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: '0.65rem' }}
                onClick={async () => {
                  if (!file) return;
                  const res = await api.uploadVersion(pickSpec.id, versionLabel, file);
                  alert(`Uploaded. Change summary: ${res.changelog?.summary || 'n/a'}`);
                  const refreshed = await api.specs();
                  setSpecs(refreshed);
                  const self = refreshed.find((x) => x.id === pickSpec.id);
                  const latest = self?.versions?.[0];
                  if (latest) setActiveVid(latest.id);
                }}
              >
                Upload & analyze
              </button>

              <div style={{ marginTop: '1rem', fontWeight: 700 }}>Versions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {pickSpec.versions?.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="btn-ghost"
                    onClick={() => setActiveVid(v.id)}
                    style={{
                      borderColor: activeVid === v.id ? 'rgba(20,184,166,0.5)' : undefined,
                    }}
                  >
                    {v.version} · {v.original_filename || 'file'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {detail && (
        <div className="card" style={{ marginTop: '1rem', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Viewer (read-only)</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Select text to capture a DR excerpt — editing is disabled.
              </div>
            </div>
            {selection && (
              <button type="button" className="btn-primary" onClick={createDr}>
                Create DR from selection
              </button>
            )}
          </div>

          {detail.mime_type === 'application/pdf' ||
          detail.original_filename?.toLowerCase().endsWith('.pdf') ? (
            <iframe
              title="pdf"
              src={detail.fileUrl}
              style={{
                width: '100%',
                height: '520px',
                border: 'none',
                marginTop: '0.75rem',
                borderRadius: 12,
                background: '#fff',
              }}
            />
          ) : html ? (
            <div
              ref={viewerRef}
              className="doc-viewer readonly doc-html"
              onMouseUp={onMouseUpViewer}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
              Preview unavailable — extracted text is still stored server-side for diff / stale checks.
            </div>
          )}

          {detail.changelog && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontWeight: 700 }}>Change list</div>
              <div style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
                {detail.changelog.summary}
              </div>
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
            </div>
          )}

          {floatPos && selection && (
            <div
              style={{
                position: 'absolute',
                top: floatPos.top,
                left: floatPos.left,
                zIndex: 5,
              }}
            >
              <button type="button" className="btn-primary" onClick={createDr}>
                Create DR
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const inputStyle = {
  minWidth: 220,
  padding: '0.45rem 0.65rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(0,0,0,0.25)',
  color: 'var(--text)',
};
