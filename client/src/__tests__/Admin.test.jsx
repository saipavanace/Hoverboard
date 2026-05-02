import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Admin from '../pages/Admin.jsx';
import { ThemeProvider } from '../theme/ThemeContext.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { ProjectProvider } from '../context/ProjectContext.jsx';
import { setupFetchMock } from '../test/mocks.js';

function renderAdminWithUser(user) {
  setupFetchMock({
    'GET /api/auth/me': { user },
    'GET /api/config': { authUi: { builtinAdminEmail: 'admin@mycompany.com' } },
    'GET /api/projects': [
      {
        id: 1,
        slug: 'default',
        name: 'Default',
        description: '',
        status: 'active',
        created_at: '',
      },
    ],
    'GET /api/projects/1/teams': [],
    'GET /api/admin/users': [],
  });
  try {
    localStorage.setItem('hb_project_id', '1');
  } catch {
    /* ignore */
  }

  return render(
    <ThemeProvider>
      <AuthProvider>
        <ProjectProvider>
          <MemoryRouter initialEntries={['/projects/1/admin']}>
            <Routes>
              <Route path="/projects/:projectId/admin" element={<Admin />} />
            </Routes>
          </MemoryRouter>
        </ProjectProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('Admin', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('shows user directory and Add local user for system administrators', async () => {
    renderAdminWithUser({
      id: 1,
      email: 'sys@x.com',
      display_name: 'Sys',
      global_roles: ['system_admin'],
      project_roles: { 1: ['project_admin'] },
      authDisabled: false,
    });

    await screen.findByText(/Users, teams, platform audit trail/i);
    fireEvent.click(screen.getByRole('button', { name: /^users$/i }));
    expect(await screen.findByText(/Add local user/i)).toBeTruthy();
  });

  it('hides user directory for project-only admins (no system_admin)', async () => {
    renderAdminWithUser({
      id: 2,
      email: 'pm@x.com',
      display_name: 'PM',
      global_roles: [],
      project_roles: { 1: ['project_admin'] },
      authDisabled: false,
    });

    await waitFor(() => {
      expect(screen.queryByText(/Add local user/i)).toBeNull();
    });
    expect(await screen.findByText(/Teams, baselines, and sign-off policies/i)).toBeTruthy();
    expect(screen.queryByText(/platform audit trail/i)).toBeNull();
  });
});
