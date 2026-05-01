import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Specs from '../pages/Specs.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('Specs page', () => {
  beforeEach(() => {
    localStorage.clear();
    setupFetchMock({
      'GET /api/config': {
        requirementCategories: ['System'],
      },
      '* /api/specs': [],
    });
  });

  it('does not render the spec viewer until the user clicks View spec', async () => {
    render(
      <MemoryRouter>
        <Specs />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Active spec/i)).toBeTruthy();
    expect(screen.queryByText(/Viewer \(read-only\)/i)).toBeNull();
  });
});
