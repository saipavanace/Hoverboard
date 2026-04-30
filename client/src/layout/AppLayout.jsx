import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme/ThemeContext.jsx';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/specs', label: 'Specs' },
  { to: '/drs', label: 'Design reqs' },
  { to: '/vrs', label: 'Verification' },
  { to: '/signatures', label: 'Signatures' },
  { to: '/iso', label: 'ISO 26262' },
  { to: '/settings', label: 'Settings' },
];

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg({}));
  }, []);

  const accent = cfg?.branding?.accent || '#14b8a6';

  return (
    <div className="shell">
      <style>{`
        .shell { min-height: 100%; display: flex; flex-direction: column; }
        header.app-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 20;
        }
        .brand { display: flex; align-items: baseline; gap: 0.65rem; }
        .brand h1 {
          margin: 0; font-size: 1.15rem; letter-spacing: -0.03em;
          font-weight: 700;
        }
        .brand span { color: var(--muted); font-size: 0.85rem; }
        nav.primary-nav {
          display: flex; gap: 0.35rem; flex-wrap: wrap;
        }
        nav.primary-nav a {
          padding: 0.4rem 0.75rem; border-radius: 999px;
          color: var(--muted); font-weight: 600; font-size: 0.88rem;
          text-decoration: none;
        }
        nav.primary-nav a:hover { color: var(--text); background: rgba(255,255,255,0.06); }
        nav.primary-nav a.active {
          color: var(--nav-active-fg);
          background: ${accent};
        }
        header .hdr-tools {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .burger {
          display: none;
          background: rgba(255,255,255,0.06);
          color: var(--text);
          padding: 0.45rem 0.65rem;
          border-radius: 10px;
          border: 1px solid var(--border);
        }
        main.page-main {
          flex: 1;
          padding: 1.25rem clamp(1rem, 3vw, 2rem) 2.5rem;
          max-width: 1280px;
          width: 100%;
          margin: 0 auto;
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
        @media (max-width: 900px) {
          .burger { display: inline-flex; }
          nav.primary-nav {
            display: ${menuOpen ? 'flex' : 'none'};
            flex-direction: column;
            width: 100%;
            padding-top: 0.75rem;
          }
          header.app-header { flex-wrap: wrap; gap: 0.75rem; }
        }
      `}</style>
      <header className="app-header">
        <div className="brand">
          <h1 style={{ color: accent }}>Hoverboard</h1>
          <span>{cfg?.projectName || 'Requirements & verification'}</span>
        </div>
        <div className="hdr-tools">
          <div className="theme-toggle" title="Appearance">
            <span>Dark</span>
            <button
              type="button"
              className="theme-toggle-track"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className={`theme-toggle-thumb ${theme === 'light' ? 'light' : ''}`} />
            </button>
            <span>Light</span>
          </div>
          <button
            type="button"
            className="burger"
            aria-label="Menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
          </button>
          <nav className="primary-nav">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setMenuOpen(false)}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="page-main">
        <Outlet />
      </main>
    </div>
  );
}
