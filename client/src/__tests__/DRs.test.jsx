import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DRs from '../pages/DRs.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('DRs page', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    setupFetchMock({
      'GET /api/config': {
        requirementCategories: ['System', 'CHI'],
      },
      '* /api/drs': ({ url }) => {
        calls.push(url);
        return { ok: true, json: async () => [] };
      },
    });
  });

  it('renders filter controls and refetches when category changes', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1/drs']}>
        <Routes>
          <Route path="/projects/:projectId/drs" element={<DRs />} />
        </Routes>
      </MemoryRouter>
    );

    const categorySelect = await screen.findAllByDisplayValue('All');
    fireEvent.change(categorySelect[0], { target: { value: 'CHI' } });

    await waitFor(() => {
      expect(calls.some((u) => u.includes('category=CHI'))).toBe(true);
    });
  });
});
