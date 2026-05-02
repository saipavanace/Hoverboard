import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ISO from '../pages/ISO.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('ISO', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('redirects to dashboard when iso26262Enabled is off', async () => {
    setupFetchMock({
      'GET /api/config': { iso26262Enabled: false },
    });

    render(
      <MemoryRouter initialEntries={['/projects/1/iso']}>
        <Routes>
          <Route path="/projects/:projectId/iso" element={<ISO />} />
          <Route path="/projects/:projectId/dashboard" element={<div>Dashboard stub</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Dashboard stub/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText(/ISO 26262 workspace/i)).toBeNull();
    });
  });

  it('shows ISO workspace when iso26262Enabled is true', async () => {
    setupFetchMock({
      'GET /api/config': { iso26262Enabled: true },
      'GET /api/iso/audit-log': [],
    });

    render(
      <MemoryRouter initialEntries={['/projects/7/iso']}>
        <Routes>
          <Route path="/projects/:projectId/iso" element={<ISO />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /ISO 26262 workspace/i })).toBeTruthy();
  });
});
