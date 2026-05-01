import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Regressions from '../pages/Regressions.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('Regressions page', () => {
  beforeEach(() => {
    setupFetchMock({
      'POST /api/regressions/ingest-directory': {
        ok: true,
        rootDir: '/tmp/x',
        filesScanned: 1,
        failures: 3,
        bins: [],
        signaturesUpserted: 1,
      },
    });
  });

  it('disables ingest button until a path is entered', async () => {
    render(
      <MemoryRouter>
        <Regressions />
      </MemoryRouter>
    );

    const btn = await screen.findByRole('button', { name: /ingest failures/i });
    expect(btn).toBeDisabled();

    const input = screen.getByPlaceholderText(/regression\//i);
    fireEvent.change(input, { target: { value: '/tmp/x' } });

    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
