import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Settings from '../pages/Settings.jsx';
import { setupFetchMock } from '../test/mocks.js';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { ProjectProvider } from '../context/ProjectContext.jsx';

describe('Settings', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
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
      'GET /api/projects': [],
      'GET /api/config': {
        projectName: 'Hoverboard',
        notifications: { enabled: false, smtp: { from: {} }, subscriptions: [] },
        auth: {
          builtinAdmin: { email: 'admin@hoverboard.builtin', username: 'admin', password: '' },
        },
      },
    });
  });

  it('renders configuration heading and JSON editor after config loads', async () => {
    render(
      <AuthProvider>
        <ProjectProvider>
          <Settings />
        </ProjectProvider>
      </AuthProvider>
    );

    expect(await screen.findByRole('heading', { name: /configuration/i })).toBeTruthy();
    expect(await screen.findByDisplayValue(/"projectName"/)).toBeTruthy();
  });
});
