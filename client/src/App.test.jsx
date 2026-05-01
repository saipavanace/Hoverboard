import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import ProjectLayout from './layout/ProjectLayout.jsx';
import { ThemeProvider } from './theme/ThemeContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ProjectProvider } from './context/ProjectContext.jsx';
import { setupFetchMock } from './test/mocks.js';

describe('Project shell', () => {
  beforeEach(() => {
    setupFetchMock({
      'GET /api/auth/me': {
        user: {
          id: 1,
          email: 'u@test',
          display_name: 'U',
          global_roles: [],
          project_roles: { 1: ['viewer'] },
          authDisabled: true,
        },
      },
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
      'GET /api/config': {
        branding: { accent: '#14b8a6' },
        authUi: { authDisabled: true, localLoginEnabled: true, oidcConfigured: false },
      },
      '* /api/metrics': {},
    });
  });

  it('renders dashboard inside project layout', async () => {
    render(
      <ThemeProvider>
        <AuthProvider>
          <ProjectProvider>
            <MemoryRouter initialEntries={['/projects/1/dashboard']}>
              <Routes>
                <Route path="/projects/:projectId" element={<ProjectLayout />}>
                  <Route path="dashboard" element={<Dashboard />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </ProjectProvider>
        </AuthProvider>
      </ThemeProvider>
    );
    expect(await screen.findByRole('heading', { name: /status dashboard/i })).toBeTruthy();
  });
});
