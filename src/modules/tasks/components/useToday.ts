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
    // A second after midnight, so the new day has surely started. Re-armed every time: if the clock
    // was moved and the day did not change, `today` stays the same and this effect would not re-run.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          refresh();
          schedule();
        },
        msUntilNextDay(Date.now()) + 1000,
      );
    };
    schedule();
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
