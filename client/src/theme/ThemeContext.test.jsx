import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext.jsx';

function Probe() {
  const { theme } = useTheme();
  return <span data-testid="t">{theme}</span>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage?.clear === 'function') localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('defaults to light when no preference is stored', () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(getByTestId('t').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('respects stored dark preference', () => {
    const store = { 'hoverboard-theme': 'dark' };
    vi.stubGlobal('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = v;
      },
      removeItem: (k) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    });
    try {
      const { getByTestId } = render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      );
      expect(getByTestId('t').textContent).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
