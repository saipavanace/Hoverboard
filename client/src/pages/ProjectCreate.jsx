import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from '../context/ProjectContext.jsx';
import { projectPath } from '../lib/paths.js';

export default function ProjectCreate() {
  const navigate = useNavigate();
  const { refreshProjects, setProjectId, projects } = useProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshProjects().catch(() => {});
  }, [refreshProjects]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      const cid = copyFromId ? Number(copyFromId) : null;
      if (cid && Number.isFinite(cid)) body.copy_from_project_id = cid;

      const row = await api.createProject(body);
      await refreshProjects();
      setProjectId(row.id);
      navigate(projectPath(row.id, 'dashboard'), { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create project');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        <Link to="/projects" style={{ color: 'var(--muted)' }}>
          ← Projects
        </Link>
      </nav>
      <h1 className="page-title">Create project</h1>
      <p className="page-lede">You will be added as project admin for this workspace.</p>

      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.85rem' }}>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Name *</div>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Vehicle dynamics"
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Description</div>
            <textarea
              className="field-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary for the team"
            />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Start from existing project (optional)</div>
            <select
              className="field-input"
              value={copyFromId}
              onChange={(e) => setCopyFromId(e.target.value)}
            >
              <option value="">Empty project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.slug}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
              Copies specs (with files), design requirements, verification items, and links into the new workspace.
            </div>
          </label>
          {error && (
            <div style={{ color: '#f87171', fontSize: '0.9rem' }} role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
      </div>
    </>
  );
}
