import { useEffect, type ReactNode } from 'react';
import { useThemeStore } from '@/store/themeStore';

/**
 * Applies the persisted (or system) theme to the <html> element and keeps it
 * reconciled after zustand's persist middleware finishes hydrating from
 * localStorage. The inline script in index.html already prevents a flash of
 * incorrect theme on first paint; this effect keeps things in sync afterwards.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const isDark =
      theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  return <>{children}</>;
}
