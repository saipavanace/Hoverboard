import { NavLink, Outlet, Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme/ThemeContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import { projectPath } from '../lib/paths.js';
import ToolVersionBadge from '../components/ToolVersionBadge.jsx';

function sbClass({ isActive }) {
  return `proj-sb-link${isActive ? ' proj-sb-link-active' : ''}`;
}

export default function ProjectLayout() {
  const { projectId: paramId } = useParams();
  const pid = Number(paramId);
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cfg, setCfg] = useState(null);
  const { theme, toggle } = useTheme();
  const { user, logout, isSystemAdmin } = useAuth();
  const { projects, setProjectId, loading: projLoading } = useProject();

  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg({}));
  }, []);

  useEffect(() => {
    if (!Number.isFinite(pid)) {
      navigate('/unauthorized', { replace: true, state: { reason: 'project' } });
      return;
    }
    setProjectId(pid);
  }, [pid, setProjectId, navigate]);

  useEffect(() => {
    if (projLoading) return;
    if (!projects.length) return;
    if (!projects.some((p) => p.id === pid)) {
      navigate('/unauthorized', { replace: true, state: { reason: 'project' } });
    }
  }, [projLoading, projects, pid, navigate]);

  const accent = cfg?.branding?.accent || '#14b8a6';

  if (projLoading || !projects.some((p) => p.id === pid)) {
    return (
      <div style={{ padding: '2rem', color: 'var(--muted)' }} role="status">
        Loading project…
      </div>
    );
  }

  const current = projects.find((p) => p.id === pid);

  return (
    <div className="shell project-shell">
      <style>{`
        .project-shell { min-height: 100%; display: flex; flex-direction: column; }
        header.proj-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.75rem; flex-wrap: wrap;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 30;
        }
        .proj-brand { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
        .proj-brand h1 { margin: 0; font-size: 1.1rem; font-weight: 700; letter-spacing: -0.03em; }
        .proj-brand span { color: var(--muted); font-size: 0.8rem; }
        .proj-tools {
          display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;
        }
        .proj-account {
          display: flex; align-items: baseline; gap: 0.35rem;
          padding-left: 0.65rem; margin-left: 0.15rem;
          border-left: 1px solid var(--border);
        }
        .proj-account-label {
          font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;
        }
        .proj-body {
          display: flex; flex: 1;
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          align-items: stretch;
        }
        aside.proj-sidebar {
          width: 240px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          padding: 1rem 0.65rem;
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        aside.proj-sidebar .nav-section-label {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          padding: 0.25rem 0.5rem;
          margin-top: 0.35rem;
        }
        main.proj-main {
          flex: 1;
          min-width: 0;
          padding: 1.25rem clamp(1rem, 2vw, 1.75rem) 2.5rem;
        }
        .burger {
          display: none;
          background: rgba(255,255,255,0.06);
          color: var(--text);
          padding: 0.45rem 0.65rem;
          border-radius: 10px;
          border: 1px solid var(--border);
        }
        @media (max-width: 960px) {
          aside.proj-sidebar {
            display: ${sidebarOpen ? 'flex' : 'none'};
            position: fixed;
            left: 0; top: 52px;
            bottom: 0;
            z-index: 25;
            overflow-y: auto;
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }
          .burger { display: inline-flex; }
        }
        .page-title {
          margin: 0 0 0.35rem;
          font-size: clamp(1.35rem, 2.5vw, 1.75rem);
          letter-spacing: -0.03em;
        }
        .page-lede {
          margin: 0 0 1.25rem;
          color: var(--muted);
          max-width: 62ch;
        }
        aside.proj-sidebar .proj-sb-link {
          display: block;
          padding: 0.4rem 0.65rem;
          border-radius: 8px;
          color: var(--muted);
          text-decoration: none;
          font-weight: 600;
          font-size: 0.88rem;
        }
        aside.proj-sidebar .proj-sb-link-active {
          color: var(--nav-active-fg);
          background: rgba(20,184,166,0.22);
          font-weight: 700;
        }
      `}</style>

      <header className="proj-header">
        <div className="proj-brand">
          <Link to={projectPath(pid, 'dashboard')} style={{ textDecoration: 'none', color: accent }}>
            <h1>Hoverboard</h1>
          </Link>
          <span>{current?.name || cfg?.projectName || 'Project'}</span>
          <ToolVersionBadge toolVersion={cfg?.toolVersion} toolVersionMeta={cfg?.toolVersionMeta} />
        </div>
        <div className="proj-tools">
          <Link
            to="/projects"
            style={{ fontSize: '0.82rem', fontWeight: 600, color: accent, textDecoration: 'none' }}
          >
            Open projects
          </Link>
          <Link
            to="/projects/new"
            style={{ fontSize: '0.82rem', fontWeight: 600, color: accent, textDecoration: 'none' }}
          >
            Create project
          </Link>
          {isSystemAdmin && (
            <Link
              to={projectPath(pid, 'admin')}
              style={{ fontSize: '0.82rem', fontWeight: 600, color: accent, textDecoration: 'none' }}
              title={
                cfg?.iso26262Enabled === true
                  ? 'Users, roles, teams, audit, baselines'
                  : 'Users, roles, teams, baselines'
              }
            >
              Administration
            </Link>
          )}
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--muted)',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {user ? (
              <>
                <div className="proj-account" title={user.email}>
                  <span className="proj-account-label">Account</span>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text)',
                      maxWidth: 'min(200px, 40vw)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--mono, ui-monospace, monospace)',
                    }}
                  >
                    {user.email}
                  </span>
                </div>
                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '0.25rem 0.55rem',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                  onClick={() => logout()}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link to="/login" style={{ color: accent }}>
                Sign in
              </Link>
            )}
          </div>
          <div className="theme-toggle" title="Appearance">
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Dark</span>
            <button
              type="button"
              className="theme-toggle-track"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className={`theme-toggle-thumb ${theme === 'light' ? 'light' : ''}`} />
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Light</span>
          </div>
          <button type="button" className="burger" aria-label="Sidebar" onClick={() => setSidebarOpen((s) => !s)}>
            Menu
          </button>
        </div>
      </header>

      <div className="proj-body">
        <aside className="proj-sidebar" aria-label="Workspace navigation">
          <div className="nav-section-label">Workspace</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <NavLink to={projectPath(pid, 'dashboard')} end className={sbClass}>
              Dashboard
            </NavLink>
            <NavLink to={projectPath(pid, 'specs')} className={sbClass}>
              Specs
            </NavLink>
            <NavLink to={projectPath(pid, 'drs')} className={sbClass}>
              Design requirements
            </NavLink>
            <NavLink to={projectPath(pid, 'vrs')} className={sbClass}>
              Verification
            </NavLink>
          </nav>
          <div className="nav-section-label">Quality</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <NavLink to={projectPath(pid, 'signatures')} className={sbClass}>
              Signatures
            </NavLink>
            <NavLink to={projectPath(pid, 'regressions')} className={sbClass}>
              Regressions
            </NavLink>
            {cfg?.iso26262Enabled === true && (
              <NavLink to={projectPath(pid, 'iso')} className={sbClass}>
                ISO 26262
              </NavLink>
            )}
          </nav>
          <div className="nav-section-label">Project</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cfg?.iso26262Enabled === true && (
              <NavLink to={projectPath(pid, 'audit')} className={sbClass}>
                Audit
              </NavLink>
            )}
            <NavLink to={projectPath(pid, 'settings')} className={sbClass}>
              Settings
            </NavLink>
          </nav>
        </aside>

        <main className="proj-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
