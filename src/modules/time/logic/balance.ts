import { addDays, startOfWeek } from 'date-fns';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, Id, Millis, TimeCategory, TimeEntry } from '../../../core/types';
import { dayTotals, totalsBetween, type CategoryTotals } from './totals';

const MIN = 60_000;
const WEEK = 7 * 24 * 60 * MIN;

/** '1 ч 20 мин', '45 мин', '0 мин' (rounded down to whole minutes). */
export function formatHoursMinutes(ms: Millis): string {
  const minutes = Math.floor(Math.max(0, ms) / MIN);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** '+1 ч 20 мин' / '−40 мин' (typographic minus); under a minute — 'без изменений'. */
export function formatDelta(ms: Millis): string {
  if (Math.abs(ms) < MIN) return 'без изменений';
  return `${ms > 0 ? '+' : '−'}${formatHoursMinutes(Math.abs(ms))}`;
}

/** Local Monday 00:00 of the week containing `day`. */
export function weekStartMs(day: DateKey): Millis {
  return startOfWeek(fromDateKey(day), { weekStartsOn: 1 }).getTime();
}

export interface BalanceRow {
  categoryId: Id;
  name: string;
  color: string | undefined;
  ms: Millis;
  /** This week minus the same days of last week. Only meaningful when `hasPreviousWeek`. */
  deltaMs: Millis;
}

export interface Balance {
  day: BalanceRow[];
  week: BalanceRow[];
  dayTotal: Millis;
  weekTotal: Millis;
  hasPreviousWeek: boolean;
}

const sum = (t: CategoryTotals) => Object.values(t).reduce((a, b) => a + b, 0);

/**
 * Time per category for `day` and for its Monday–Sunday week, sorted by most time.
 * The week is compared with last week up to the same moment (Thursday 18:00 ↔ last Thursday 18:00),
 * so a half-finished week is not compared with a full one.
 */
export function balance(
  entries: readonly TimeEntry[],
  categories: readonly TimeCategory[],
  day: DateKey,
  now: Millis,
): Balance {
  const monday = weekStartMs(day);
  const weekEnd = addDays(monday, 7).getTime();
  const week = totalsBetween(entries, monday, weekEnd, now);
  const comparableEnd = Math.min(now, weekEnd) - WEEK;
  const previous = totalsBetween(entries, monday - WEEK, Math.max(monday - WEEK, comparableEnd), now);
  const today = dayTotals(entries, day, now);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const rows = (totals: CategoryTotals, withPrevious: boolean): BalanceRow[] => {
    const ids = new Set(Object.keys(totals));
    if (withPrevious) for (const id of Object.keys(previous)) ids.add(id);
    return [...ids]
      .map((id) => {
        const c = byId.get(id);
        const ms = totals[id] ?? 0;
        return {
          categoryId: id,
          name: c?.name ?? 'Без категории',
          color: c?.color,
          ms,
          deltaMs: ms - (previous[id] ?? 0),
        };
      })
      .sort((a, b) => b.ms - a.ms || a.deltaMs - b.deltaMs || a.name.localeCompare(b.name));
  };

  return {
    day: rows(today, false),
    week: rows(week, true),
    dayTotal: sum(today),
    weekTotal: sum(week),
    hasPreviousWeek: sum(previous) > 0,
  };
}
