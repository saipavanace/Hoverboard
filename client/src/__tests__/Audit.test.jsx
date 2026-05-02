import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Audit from '../pages/Audit.jsx';
import { ThemeProvider } from '../theme/ThemeContext.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { setupFetchMock } from '../test/mocks.js';

function renderAudit(user) {
  setupFetchMock({
    'GET /api/auth/me': { user },
    'GET /api/config': { iso26262Enabled: true },
    '* /api/admin/audit-events': [],
  });
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/projects/1/audit']}>
          <Routes>
            <Route path="/projects/:projectId/audit" element={<Audit />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('Audit (project)', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('shows access denied for viewers without admin or auditor role', async () => {
    renderAudit({
      id: 3,
      email: 'v@x.com',
      display_name: 'V',
      global_roles: [],
      project_roles: { 1: ['viewer'] },
      authDisabled: false,
    });

    expect(
      await screen.findByText(/You need administrator or auditor access to view audit events/i)
    ).toBeTruthy();
  });

  it('shows audit table when user is administrator', async () => {
    renderAudit({
      id: 1,
      email: 'a@x.com',
      display_name: 'A',
      global_roles: ['system_admin'],
      project_roles: { 1: ['project_admin'] },
      authDisabled: false,
    });

    expect(await screen.findByRole('columnheader', { name: /When/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Action/i })).toBeTruthy();
  });

  it('redirects when ISO features are disabled in config', async () => {
    setupFetchMock({
      'GET /api/auth/me': {
        user: {
          id: 1,
          email: 'a@x.com',
          display_name: 'A',
          global_roles: ['system_admin'],
          project_roles: {},
          authDisabled: false,
        },
      },
      'GET /api/config': { iso26262Enabled: false },
    });

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/projects/1/audit']}>
            <Routes>
              <Route path="/projects/:projectId/audit" element={<Audit />} />
              <Route path="/projects/:projectId/dashboard" element={<div>Dash</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    expect(await screen.findByText(/^Dash$/)).toBeTruthy();
  });
});
