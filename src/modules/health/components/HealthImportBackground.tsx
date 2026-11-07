import { useEffect } from 'react';
import { useTodayKey } from '../../../core/dates';
import { getCapabilities } from '../../../core/platform';
import { importIfDue } from '../data/healthImport';

/**
 * Mounted by the shell on every page (#131): with the import on, the night is imported when the app starts and when
 * it comes back to the screen (at most hourly) — so in the morning it is already logged and the morning flow's
 * «Сон» step is done.
 */
export function HealthImportBackground() {
  return getCapabilities().healthImport ? <ImportKeeper /> : null;
}

function ImportKeeper() {
  const today = useTodayKey();
  useEffect(() => {
    void importIfDue(today);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void importIfDue(today);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [today]);
  return null;
}
