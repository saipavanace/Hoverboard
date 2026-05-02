import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { projectPath } from '../lib/paths.js';

export default function Audit() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const allowed = user?.authDisabled || isAdmin || user?.global_roles?.includes('auditor');

  useEffect(() => {
    let cancelled = false;
    api.config().then((c) => {
      if (cancelled) return;
      if (c.iso26262Enabled !== true) {
        navigate(projectPath(Number(projectId), 'dashboard'), { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, projectId]);

  useEffect(() => {
    if (!allowed) return;
    setError('');
    let cancelled = false;
    (async () => {
      try {
        const c = await api.config();
        if (cancelled || c.iso26262Enabled !== true) return;
        const data = await api.adminAudit(300);
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) {
    return (
      <>
        <h1 className="page-title">Audit trail</h1>
        <p className="page-lede">You need administrator or auditor access to view audit events.</p>
        <Link to={projectPath(Number(projectId), 'dashboard')} style={{ color: 'var(--muted)' }}>
          ← Dashboard
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Audit trail</h1>
      <p className="page-lede">Recent platform events (globally scoped; filtered by server RBAC).</p>
      {error && (
        <p style={{ color: '#f87171' }} role="alert">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{a.occurred_at}</td>
                <td>{a.action}</td>
                <td>
                  {a.entity_type} {a.entity_id}
                </td>
                <td>{a.actor_user_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
