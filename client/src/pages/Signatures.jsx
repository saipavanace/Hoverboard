import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Signatures() {
  const [rows, setRows] = useState([]);
  const [scan, setScan] = useState(null);

  async function refresh() {
    const data = await api.signatures();
    setRows(data);
  }

  useEffect(() => {
    refresh().catch(() => setRows([]));
  }, []);

  return (
    <>
      <h1 className="page-title">Signature trends</h1>
      <p className="page-lede">
        Automatic regression binning clusters raw failures into signatures with IDs, trends, and
        triage metadata — upgrade path to full Simscope-style workflows.
      </p>

      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            await api.demoSeed();
            refresh();
          }}
        >
          Load demo signatures
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await api.ingestRegressions({
              lines: [
                'FAIL: uart_timeout waiting for TX empty',
                'ERROR sim: assertion failed at tb_pcie.sv:120',
              ],
            });
            refresh();
          }}
        >
          Ingest sample lines
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            const r = await api.scanRegressionPaths();
            setScan(r);
            alert(
              `Scanned roots; collected ${r.linesCollected} failure lines (preview ${r.previewBins?.length || 0} bins).`
            );
          }}
        >
          Scan regression paths
        </button>
      </div>

      {scan && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.88rem' }}>
          <strong>Last scan:</strong> {scan.linesCollected} lines from configured roots. See{' '}
          <code>hoverboard.config.json</code> → <code>regressionRoots</code>.
        </div>
      )}

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
              <tr key={r.id}>
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
                  <Link to={`/signatures/${r.signature_key}`}>Diagnostics</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p style={{ color: 'var(--muted)' }}>
          No signatures yet — seed demo data or ingest regression logs.
        </p>
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
