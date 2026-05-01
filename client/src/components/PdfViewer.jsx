import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Outline, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PDF_OPTIONS = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
};

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.35, 1.6, 2.0];

const STYLE = `
  .hb-pdf-doc { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .hb-pdf-doc > * { flex: 1; min-height: 0; }
  .hb-pdf-outline ul { list-style: none; padding-left: 12px; margin: 0; }
  .hb-pdf-outline li { margin: 2px 0; }
  .hb-pdf-outline a {
    display: block;
    padding: 4px 6px;
    color: #0f172a;
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.82rem;
  }
  .hb-pdf-outline a:hover { background: rgba(20,184,166,0.12); }
`;

export default function PdfViewer({ fileUrl, onMouseUp }) {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [activePage, setActivePage] = useState(1);
  const [sidebarTab, setSidebarTab] = useState('outline'); // 'pages' | 'outline' | null
  const mainRef = useRef(null);
  const pageRefs = useRef({});
  const file = useMemo(() => ({ url: fileUrl }), [fileUrl]);

  useEffect(() => {
    pageRefs.current = {};
    setActivePage(1);
    setNumPages(null);
  }, [fileUrl]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !numPages) return undefined;
    function recompute() {
      const mTop = main.scrollTop;
      const mBottom = mTop + main.clientHeight;
      let best = 1;
      let bestVisible = -Infinity;
      for (let n = 1; n <= numPages; n++) {
        const el = pageRefs.current[n];
        if (!el) continue;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        const visible = Math.min(bottom, mBottom) - Math.max(top, mTop);
        if (visible > bestVisible) {
          bestVisible = visible;
          best = n;
        }
      }
      setActivePage(best);
    }
    main.addEventListener('scroll', recompute, { passive: true });
    recompute();
    return () => main.removeEventListener('scroll', recompute);
  }, [numPages, scale]);

  const jumpTo = useCallback((n) => {
    const el = pageRefs.current[n];
    const main = mainRef.current;
    if (!el || !main) return;
    main.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: 'smooth' });
  }, []);

  function zoom(delta) {
    setScale((s) => {
      const idx = ZOOM_STEPS.findIndex((z) => Math.abs(z - s) < 0.001);
      const cur = idx === -1 ? ZOOM_STEPS.indexOf(1.0) : idx;
      const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, cur + delta));
      return ZOOM_STEPS[next];
    });
  }

  return (
    <div
      style={{
        background: '#fff',
        color: '#111',
        borderRadius: 12,
        border: '1px solid var(--border)',
        height: 'calc(100vh - 180px)',
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <style>{STYLE}</style>
      <Toolbar
        numPages={numPages}
        activePage={activePage}
        onJump={jumpTo}
        scale={scale}
        onZoomIn={() => zoom(1)}
        onZoomOut={() => zoom(-1)}
        onZoomReset={() => setScale(1.0)}
        sidebarTab={sidebarTab}
        onSidebarTab={setSidebarTab}
      />
      <Document
        file={file}
        options={PDF_OPTIONS}
        className="hb-pdf-doc"
        loading={<div style={{ padding: '1rem', color: '#666' }}>Loading PDF…</div>}
        error={
          <div style={{ padding: '1rem', color: '#a00' }}>
            Could not render this PDF. Try re-uploading.
          </div>
        }
        onLoadSuccess={(doc) => setNumPages(doc.numPages)}
      >
        <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
          {sidebarTab && numPages && (
            <aside
              style={{
                width: sidebarTab === 'pages' ? 200 : 240,
                borderRight: '1px solid #e5e7eb',
                background: '#f8fafc',
                overflowY: 'auto',
                padding: '8px 6px',
              }}
            >
              {sidebarTab === 'pages' && (
                <PageThumbnails
                  numPages={numPages}
                  activePage={activePage}
                  onJump={jumpTo}
                />
              )}
              {sidebarTab === 'outline' && (
                <Outline
                  className="hb-pdf-outline"
                  onItemClick={({ pageNumber }) => jumpTo(pageNumber)}
                />
              )}
            </aside>
          )}
          <div
            ref={mainRef}
            onMouseUp={onMouseUp}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '12px',
              userSelect: 'text',
              background: '#e5e7eb',
              position: 'relative',
            }}
          >
            {numPages &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  data-page={n}
                  ref={(el) => {
                    pageRefs.current[n] = el;
                  }}
                  style={{
                    background: '#fff',
                    boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
                    margin: '0 auto 14px',
                    width: 'fit-content',
                  }}
                >
                  <Page
                    pageNumber={n}
                    scale={scale}
                    renderTextLayer
                    renderAnnotationLayer={false}
                  />
                </div>
              ))}
          </div>
        </div>
      </Document>
    </div>
  );
}

function PageThumbnails({ numPages, activePage, onJump }) {
  return (
    <>
      {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onJump(n)}
          style={{
            display: 'block',
            width: '100%',
            background: 'transparent',
            border: n === activePage ? '2px solid #14b8a6' : '1px solid #cbd5e1',
            borderRadius: 6,
            padding: 4,
            margin: '4px 0',
            cursor: 'pointer',
          }}
        >
          <div style={{ pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
            <Page
              pageNumber={n}
              width={170}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#475569', marginTop: 2 }}>
            {n}
          </div>
        </button>
      ))}
    </>
  );
}

function Toolbar({
  numPages,
  activePage,
  onJump,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  sidebarTab,
  onSidebarTab,
}) {
  const [pageInput, setPageInput] = useState(String(activePage));
  useEffect(() => setPageInput(String(activePage)), [activePage]);

  const sidebarBtn = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => onSidebarTab(sidebarTab === key ? null : key)}
      style={{
        ...toolBtn,
        background: sidebarTab === key ? '#14b8a6' : '#fff',
        color: sidebarTab === key ? '#04110f' : '#0f172a',
        borderColor: sidebarTab === key ? '#14b8a6' : '#cbd5e1',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 0.65rem',
        borderBottom: '1px solid #e5e7eb',
        background: '#f8fafc',
        color: '#0f172a',
        fontSize: '0.85rem',
        flexWrap: 'wrap',
      }}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {sidebarBtn('outline', 'Index')}
      {sidebarBtn('pages', 'Pages')}
      <div style={divider} />
      <button
        type="button"
        onClick={() => onJump(Math.max(1, activePage - 1))}
        style={toolBtn}
        disabled={activePage <= 1}
      >
        ◀
      </button>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = Number(pageInput);
              if (!Number.isNaN(n) && n >= 1 && n <= numPages) onJump(n);
            }
          }}
          style={{
            width: 50,
            textAlign: 'center',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '2px 4px',
            background: '#fff',
            color: '#0f172a',
          }}
        />
        <span style={{ color: '#475569' }}>/ {numPages || '—'}</span>
      </span>
      <button
        type="button"
        onClick={() => onJump(Math.min(numPages || 1, activePage + 1))}
        style={toolBtn}
        disabled={!numPages || activePage >= numPages}
      >
        ▶
      </button>
      <div style={divider} />
      <button type="button" onClick={onZoomOut} style={toolBtn}>
        −
      </button>
      <button type="button" onClick={onZoomReset} style={{ ...toolBtn, minWidth: 56 }}>
        {Math.round(scale * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} style={toolBtn}>
        +
      </button>
    </div>
  );
}

const toolBtn = {
  padding: '0.25rem 0.55rem',
  fontSize: '0.85rem',
  background: '#fff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  cursor: 'pointer',
};

const divider = { width: 1, height: 22, background: '#cbd5e1' };
