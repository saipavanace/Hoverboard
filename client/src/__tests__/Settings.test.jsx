import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Settings from '../pages/Settings.jsx';
import { setupFetchMock } from '../test/mocks.js';

describe('Settings', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
    setupFetchMock({
      'GET /api/config': {
        projectName: 'Hoverboard',
        auth: {
          builtinAdmin: { email: 'admin@hoverboard.builtin', username: 'admin', password: '' },
        },
      },
    });
  });

  it('renders configuration heading and JSON editor after config loads', async () => {
    render(<Settings />);

    expect(await screen.findByRole('heading', { name: /configuration/i })).toBeTruthy();
    expect(
      screen.getByText(/Project-independent controls/i)
    ).toBeTruthy();
    expect(await screen.findByDisplayValue(/"projectName"/)).toBeTruthy();
  });
});
