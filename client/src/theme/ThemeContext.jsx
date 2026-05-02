import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'hoverboard-theme';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === 'light' || s === 'dark') return s;
    } catch {
      /* ignore */
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = (t) => {
    if (t === 'light' || t === 'dark') setThemeState(t);
  };

  const toggle = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
