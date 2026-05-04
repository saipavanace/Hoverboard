import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectPath } from '../lib/paths.js';
import { api } from '../api.js';

export default function Signatures() {
  const { projectId } = useParams();
  const [rows, setRows] = useState([]);
  const [sliderPct, setSliderPct] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .config()
      .then((c) => {
        const t = c.regressionSignatureSimilarityThreshold;
        const pct =
          typeof t === 'number' && !Number.isNaN(t)
            ? Math.round(Math.min(1, Math.max(0, t)) * 100)
            : 12;
        if (!cancelled) setSliderPct(pct);
      })
      .catch(() => {
        if (!cancelled) setSliderPct(12);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sliderPct === null) return;
    const thr = sliderPct / 100;
    api
      .signatures({ similarity: thr })
      .then(setRows)
      .catch(() => setRows([]));
  }, [sliderPct]);

  const similarityLabel = sliderPct === null ? '…' : String(sliderPct);

  return (
    <>
      <h1 className="page-title">Signature trends</h1>

      <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Similarity (normalized edit distance)</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.65rem', maxWidth: 720 }}>
          Scale 0–100: max allowed difference between normalized failure lines (after digit folding). 0 = only
          identical normalized text merges; 100 = one bucket for all lines. Adjust live to explore clusters; the
          default on ingest comes from Settings → Regression signatures.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)', minWidth: 48 }}>0</span>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderPct ?? 0}
            disabled={sliderPct === null}
            onChange={(e) => setSliderPct(Number(e.target.value))}
            aria-label="Signature similarity threshold 0 to 100"
            style={{ flex: '1 1 220px', maxWidth: 420 }}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)', minWidth: 48 }}>100</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.9rem' }} title="Threshold (0–100)">
            {similarityLabel}
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Trend</th>
              <th>Key</th>
              <th>Title</th>
              <th>State</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.signature_key}>
                <td style={{ width: 120 }}>
                  <Spark value={r.total || 0} />
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{r.signature_key}</td>
                <td>{r.title}</td>
                <td>
                  <span className="badge badge-open">{r.state}</span>
                </td>
                <td>{r.total}</td>
                <td>
                  <Link
                    to={projectPath(Number(projectId), `signatures/${encodeURIComponent(r.signature_key)}`)}
                  >
                    Diagnostics
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p style={{ color: 'var(--muted)' }}>No signatures yet.</p>
      )}
    </>
  );
}

function Spark({ value }) {
  const pts = [3, 6, 4, 7, value % 9, value % 12, value];
  const max = Math.max(...pts, 1);
  return (
    <svg width="100" height="28" viewBox="0 0 100 28" aria-hidden>
      <polyline
        fill="none"
        stroke="#38bdf8"
        strokeWidth="2"
        points={pts
          .map((p, i) => `${(i / (pts.length - 1)) * 100},${28 - (p / max) * 24}`)
          .join(' ')}
      />
    </svg>
  );
}
