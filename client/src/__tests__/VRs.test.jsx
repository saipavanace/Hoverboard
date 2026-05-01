import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import VRs from '../pages/VRs.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('VRs page', () => {
  beforeEach(() => {
    setupFetchMock({
      'GET /api/vrs': [],
      'GET /api/drs': [
        {
          id: 1,
          public_id: 'DR-00001',
          excerpt: 'Sample excerpt about CHI',
          category: 'CHI',
        },
      ],
      'GET /api/config': {
        requirementCategories: ['System', 'CHI'],
      },
    });
  });

  it('disables Save VR until title, category, and a linked DR are present', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1/vrs']}>
        <Routes>
          <Route path="/projects/:projectId/vrs" element={<VRs />} />
        </Routes>
      </MemoryRouter>
    );

    const saveBtn = await screen.findByRole('button', { name: /save vr/i });
    expect(saveBtn).toBeDisabled();
    expect(
      screen.getByText(/title, category, and at least one linked dr are required/i)
    ).toBeTruthy();
  });

  it('shows "Not found" when typing an unknown DR ID and pressing Enter', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/1/vrs']}>
        <Routes>
          <Route path="/projects/:projectId/vrs" element={<VRs />} />
        </Routes>
      </MemoryRouter>
    );

    const drInput = await screen.findByPlaceholderText(/full DR ID/i);
    fireEvent.change(drInput, { target: { value: 'DR-99999' } });
    fireEvent.keyDown(drInput, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByText(/not found\. that dr does not exist/i)).toBeTruthy()
    );
  });
});
