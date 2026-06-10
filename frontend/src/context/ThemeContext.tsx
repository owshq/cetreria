import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { APP_EVENTS } from '@/lib/appEvents';
import { applyAppFavicon } from '@/lib/appFavicon';
import {
  applyColorScheme,
  AUTO_THEME_SYNC_MS,
  getResolvedColorScheme,
  getThemePreference,
  setThemePreference,
  syncAutoColorScheme,
  toggleManualColorScheme,
  type ColorScheme,
  type ThemePreference,
  type ThemeUpdateDetail,
} from '@/lib/colorScheme';

type ThemeContextValue = {
  preference: ThemePreference;
  colorScheme: ColorScheme;
  isDark: boolean;
  isAuto: boolean;
  setThemePreference: (preference: ThemePreference) => void;
  toggleColorScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readThemeState() {
  const preference = getThemePreference();
  const colorScheme = getResolvedColorScheme(preference);
  return { preference, colorScheme };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeState, setThemeState] = useState(readThemeState);

  const handleSetThemePreference = useCallback((preference: ThemePreference) => {
    const detail = setThemePreference(preference);
    setThemeState({ preference: detail.preference, colorScheme: detail.resolved });
  }, []);

  const handleToggleColorScheme = useCallback(() => {
    const detail = toggleManualColorScheme();
    setThemeState({ preference: detail.preference, colorScheme: detail.resolved });
  }, []);

  useEffect(() => {
    applyColorScheme(themeState.colorScheme);

    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<ThemeUpdateDetail>).detail;
      if (detail?.preference && detail?.resolved) {
        setThemeState({ preference: detail.preference, colorScheme: detail.resolved });
        return;
      }
      setThemeState(readThemeState());
    };

    const syncAccent = () => {
      applyColorScheme(getResolvedColorScheme());
    };

    const syncFavicon = () => {
      applyAppFavicon();
    };

    window.addEventListener(APP_EVENTS.colorSchemeUpdated, syncFromEvent);
    window.addEventListener(APP_EVENTS.appAccentUpdated, syncAccent);
    window.addEventListener(APP_EVENTS.appFaviconUpdated, syncFavicon);
    return () => {
      window.removeEventListener(APP_EVENTS.colorSchemeUpdated, syncFromEvent);
      window.removeEventListener(APP_EVENTS.appAccentUpdated, syncAccent);
      window.removeEventListener(APP_EVENTS.appFaviconUpdated, syncFavicon);
    };
  }, [themeState.colorScheme]);

  useEffect(() => {
    if (themeState.preference !== 'auto') {
      return undefined;
    }

    const sync = () => {
      const detail = syncAutoColorScheme();
      if (detail) {
        setThemeState({ preference: detail.preference, colorScheme: detail.resolved });
      }
    };

    sync();

    const intervalId = window.setInterval(sync, AUTO_THEME_SYNC_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [themeState.preference]);

  const value = useMemo(
    () => ({
      preference: themeState.preference,
      colorScheme: themeState.colorScheme,
      isDark: themeState.colorScheme === 'dark',
      isAuto: themeState.preference === 'auto',
      setThemePreference: handleSetThemePreference,
      toggleColorScheme: handleToggleColorScheme,
    }),
    [themeState, handleSetThemePreference, handleToggleColorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
