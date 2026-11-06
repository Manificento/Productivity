import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { useEffect, useState } from 'react';
import type { DateKey } from './types';

/** Local calendar day key 'YYYY-MM-DD'. Always use this instead of toISOString() (which is UTC). */
export function toDateKey(d: Date | number): DateKey {
  return format(d, 'yyyy-MM-dd');
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now);
}

/** Parses a DateKey as local midnight. */
export function fromDateKey(key: DateKey): Date {
  return parseISO(key);
}

export function shiftDateKey(key: DateKey, days: number): DateKey {
  return toDateKey(addDays(fromDateKey(key), days));
}

/** b − a in calendar days (positive when b is later). */
export function daysBetween(a: DateKey, b: DateKey): number {
  return differenceInCalendarDays(fromDateKey(b), fromDateKey(a));
}

/** Milliseconds from `now` to the next local midnight (always > 0). */
export function msUntilNextDay(now: number): number {
  return addDays(startOfDay(now), 1).getTime() - now;
}

/**
 * React hook: today's DateKey that changes at local midnight while the page stays open, and is re-checked
 * when the app comes back to the foreground (timers sleep on phones).
 */
export function useTodayKey(): DateKey {
  const [today, setToday] = useState(() => todayKey());

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
