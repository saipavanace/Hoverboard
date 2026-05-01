import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/** Blocks app shell until session is known; redirects anonymous users to `/login`. */
export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '40vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
        }}
        role="status"
      >
        Checking session…
      </div>
    );
  }

  if (user?.authDisabled || user?.id) {
    return <Outlet />;
  }

  return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}
