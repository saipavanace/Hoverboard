import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import { ThemeProvider } from '../theme/ThemeContext.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('Login', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('shows local login field labeled Email or username when local login is enabled', async () => {
    setupFetchMock({
      'GET /api/auth/me': () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'not authenticated', user: null }),
      }),
      'GET /api/config': {
        branding: { accent: '#14b8a6' },
        authUi: { authDisabled: false, localLoginEnabled: true, oidcConfigured: false, ldapLoginEnabled: false },
      },
    });

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<Login />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    expect(await screen.findByText(/Email or username/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in$/i })).toBeTruthy();
  });

  it('posts username login when identifier has no @', async () => {
    let postedBody;
    let loggedIn = false;
    setupFetchMock({
      'GET /api/auth/me': () => {
        if (!loggedIn) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: 'not authenticated', user: null }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            user: {
              id: 7,
              email: 'u@ex.com',
              display_name: 'U',
              global_roles: [],
              project_roles: {},
              authDisabled: false,
            },
          }),
        };
      },
      'GET /api/config': {
        authUi: { authDisabled: false, localLoginEnabled: true, oidcConfigured: false },
      },
      'POST /api/auth/login': async ({ opts }) => {
        postedBody = JSON.parse(opts.body || '{}');
        loggedIn = true;
        return { ok: true, json: async () => ({ ok: true }) };
      },
      'POST /api/auth/logout': { ok: true },
    });

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/projects" element={<div>Projects destination</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    await screen.findByLabelText(/Email or username/i);

    fireEvent.change(screen.getByLabelText(/Email or username/i), { target: { value: 'jdoe' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

    await waitFor(() => {
      expect(postedBody).toEqual({ username: 'jdoe', password: 'secret1' });
    });
  });

  it('posts email login when identifier contains @', async () => {
    let postedBody;
    let loggedIn = false;
    setupFetchMock({
      'GET /api/auth/me': () => {
        if (!loggedIn) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: 'not authenticated', user: null }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            user: {
              id: 7,
              email: 'u@ex.com',
              display_name: 'U',
              global_roles: [],
              project_roles: {},
              authDisabled: false,
            },
          }),
        };
      },
      'GET /api/config': {
        authUi: { authDisabled: false, localLoginEnabled: true, oidcConfigured: false },
      },
      'POST /api/auth/login': async ({ opts }) => {
        postedBody = JSON.parse(opts.body || '{}');
        loggedIn = true;
        return { ok: true, json: async () => ({ ok: true }) };
      },
    });

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/projects" element={<div>Projects destination</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    await screen.findByLabelText(/Email or username/i);

    fireEvent.change(screen.getByLabelText(/Email or username/i), {
      target: { value: 'pat@company.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));

    await waitFor(() => {
      expect(postedBody).toEqual({ email: 'pat@company.com', password: 'secret1' });
    });
  });

  it('shows auth-disabled message when config marks auth disabled', async () => {
    setupFetchMock({
      'GET /api/auth/me': () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'not authenticated', user: null }),
      }),
      'GET /api/config': {
        authUi: { authDisabled: true },
      },
    });

    render(
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/projects" element={<div>Projects</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    );

    expect(await screen.findByText(/Authentication is disabled on the server/i)).toBeTruthy();
  });
});
