import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useProject } from '../context/ProjectContext.jsx';

/** After login, always land on the project hub (open or create); users pick a workspace explicitly. */
export default function HomeRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { loading: projLoading } = useProject();

  useEffect(() => {
    if (loading || projLoading) return;

    if (!user?.authDisabled && !user?.id) {
      navigate('/login', { replace: true });
      return;
    }

    navigate('/projects', { replace: true });
  }, [loading, projLoading, user, navigate]);

  return (
    <div style={{ padding: '2rem', color: 'var(--muted)' }} role="status">
      Opening workspace…
    </div>
  );
}
