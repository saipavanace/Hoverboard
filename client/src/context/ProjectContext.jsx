import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setActiveProjectId } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ProjectContext = createContext(null);

const STORAGE_KEY = 'hb_project_id';

export function ProjectProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectIdState] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.projects();
      const arr = Array.isArray(list) ? list : [];
      setProjects(arr);
      return arr;
    } catch {
      setProjects([]);
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading) return;
      setLoading(true);
      try {
        const list = await refreshProjects();
        if (cancelled) return;
        let stored = null;
        try {
          stored = localStorage.getItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        let sid = stored ? Number(stored) : null;
        const ids = new Set((list || []).map((p) => p.id));
        if (sid && !ids.has(sid)) sid = null;
        if (sid) {
          setActiveProjectId(sid);
          setProjectIdState(sid);
          try {
            localStorage.setItem(STORAGE_KEY, String(sid));
          } catch {
            /* ignore */
          }
        } else {
          setActiveProjectId(null);
          setProjectIdState(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, refreshProjects]);

  const setProjectId = useCallback((id) => {
    const n = id != null && !Number.isNaN(Number(id)) ? Number(id) : null;
    setActiveProjectId(n);
    setProjectIdState(n);
    try {
      if (n != null) localStorage.setItem(STORAGE_KEY, String(n));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      projects,
      projectId,
      setProjectId,
      loading,
      refreshProjects,
      needsProjectPick: !loading && projects.length > 1 && projectId == null,
    }),
    [projects, projectId, setProjectId, loading, refreshProjects]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject requires ProjectProvider');
  return ctx;
}
