import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
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
