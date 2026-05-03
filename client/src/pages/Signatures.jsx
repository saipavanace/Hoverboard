import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectPath } from '../lib/paths.js';
import { api } from '../api.js';

export default function Signatures() {
  const { projectId } = useParams();
  const [rows, setRows] = useState([]);

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
