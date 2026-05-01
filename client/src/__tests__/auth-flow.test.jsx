import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from '../auth/RequireAuth.jsx';
import { ThemeProvider } from '../theme/ThemeContext.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { setupFetchMock } from '../test/mocks.js';

function Secret() {
  return <div>Protected content</div>;
}

describe('RequireAuth', () => {
  beforeEach(() => {
    setupFetchMock({
      'GET /api/auth/me': () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'not authenticated', user: null }),
      }),
      'GET /api/config': { authUi: { authDisabled: false, localLoginEnabled: true, oidcConfigured: false } },
    });
  });

  it('redirects unauthenticated users to login', async () => {
    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/app']}>
            <Routes>
              <Route element={<RequireAuth />}>
                <Route path="/app" element={<Secret />} />
              </Route>
              <Route path="/login" element={<div>Login page</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/login page/i)).toBeTruthy();
    });
    expect(screen.queryByText(/protected content/i)).toBeNull();
  });
});
