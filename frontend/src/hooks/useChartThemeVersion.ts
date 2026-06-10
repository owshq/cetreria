import { useEffect, useState } from 'react';
import { APP_EVENTS } from '@/lib/appEvents';

export function useChartThemeVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    window.addEventListener(APP_EVENTS.colorSchemeUpdated, bump);
    window.addEventListener(APP_EVENTS.appAccentUpdated, bump);
    return () => {
      window.removeEventListener(APP_EVENTS.colorSchemeUpdated, bump);
      window.removeEventListener(APP_EVENTS.appAccentUpdated, bump);
    };
  }, []);

  return version;
}
