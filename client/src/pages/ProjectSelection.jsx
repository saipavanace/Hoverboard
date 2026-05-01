import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { projectPath } from '../lib/paths.js';

export default function ProjectSelection() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { projects, loading, refreshProjects, setProjectId } = useProject();
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg({}));
  }, []);

  const accent = cfg?.branding?.accent || '#14b8a6';

  function enterProject(id) {
    setProjectId(id);
    navigate(projectPath(id, 'dashboard'));
  }

  if (authLoading || loading) {
    return (
      <div style={{ padding: '2rem', color: 'var(--muted)' }} role="status">
        Loading projects…
      </div>
    );
  }

  const canCreate = Boolean(user?.id || user?.authDisabled);

  return (
    <>
      <h1 className="page-title">Projects</h1>
      <p className="page-lede">
        Choose a workspace. Your selection is saved on this device and sent with API requests as{' '}
        <code style={{ fontSize: '0.85em' }}>X-Project-Id</code>.
      </p>

      {projects.length === 0 && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>No projects yet</div>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)', fontSize: '0.95rem' }}>
            {canCreate
              ? 'Create your first project to start tracking requirements, verification, and evidence.'
              : 'You do not have access to any projects. Ask an administrator to invite you.'}
          </p>
          {canCreate && (
            <Link
              to="/projects/new"
              className="btn-primary"
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                borderRadius: 10,
                textDecoration: 'none',
                background: accent,
                color: 'var(--nav-active-fg, #0f172a)',
              }}
            >
              Create your first project
            </Link>
          )}
        </div>
      )}

      {projects.length >= 1 && (
        <div
          style={{
            display: 'grid',
            gap: '0.85rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            marginBottom: '1.25rem',
          }}
        >
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="card"
              onClick={() => enterProject(p.id)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '1rem',
                background: 'var(--surface)',
                color: 'inherit',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.35rem' }}>{p.name}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                {p.description?.trim() ? p.description : 'No description'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                Status: <span style={{ color: 'var(--text)' }}>{p.status || 'active'}</span>
                {' · '}
                <span style={{ fontFamily: 'var(--mono)' }}>{p.slug}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {canCreate && (
            <Link
              to="/projects/new"
              style={{
                fontWeight: 600,
                color: accent,
                textDecoration: 'none',
              }}
            >
              + Create project
            </Link>
          )}
          <button
            type="button"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.35rem 0.65rem',
              color: 'var(--muted)',
              cursor: 'pointer',
            }}
            onClick={() => refreshProjects()}
          >
            Refresh list
          </button>
        </div>
      )}
    </>
  );
}
