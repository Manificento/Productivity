import { useEffect, useState } from 'react';
import { todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { msUntilNextDay } from '../logic/day';

/**
 * Today's DateKey that changes at local midnight while the page stays open, and is re-checked when
 * the app comes back to the foreground (timers sleep on phones).
 */
export function useToday(): DateKey {
  const [today, setToday] = useState(todayKey);

  useEffect(() => {
    const refresh = () => setToday(todayKey());
    // A second after midnight, so the new day has surely started.
    const timer = setTimeout(refresh, msUntilNextDay(Date.now()) + 1000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);

  return today;
}
