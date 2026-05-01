import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Unauthorized() {
  const { state } = useLocation();
  const { user } = useAuth();
  const reason = state?.reason;

  return (
    <div style={{ maxWidth: 520, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 className="page-title">Access denied</h1>
      <p className="page-lede">
        {reason === 'project'
          ? 'You do not have access to this project, or it does not exist.'
          : 'You are not allowed to perform this action (403).'}
      </p>
      <div className="card">
        <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--muted)' }}>
          Signed in as <strong>{user?.email || user?.display_name || '—'}</strong>. Contact a project administrator if
          you need access.
        </p>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <Link to="/projects" className="btn-primary" style={{ padding: '0.45rem 0.85rem', borderRadius: 8 }}>
            Choose a project
          </Link>
          <Link to="/" style={{ padding: '0.45rem 0.85rem', color: 'var(--muted)' }}>
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
