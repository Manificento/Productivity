import { addDays, startOfDay, startOfWeek } from 'date-fns';
import { fromDateKey, toDateKey } from '../../../core/dates';
import type { DateKey, Id, Millis, TimeEntry } from '../../../core/types';

/** Milliseconds per category id. Categories with no time are absent. */
export type CategoryTotals = Record<Id, number>;

export interface DayChunk {
  date: DateKey;
  ms: number;
}

type Interval = Pick<TimeEntry, 'start' | 'end'>;

/** End of an entry; a running timer (no `end`) counts up to `now`. */
function effectiveEnd(entry: Interval, now: Millis): Millis {
  return entry.end ?? now;
}

/** Splits an entry at local midnights into per-day durations, in chronological order. */
export function splitByDay(entry: Interval, now: Millis): DayChunk[] {
  const end = effectiveEnd(entry, now);
  const chunks: DayChunk[] = [];
  let cursor = entry.start;
  while (cursor < end) {
    const nextMidnight = addDays(startOfDay(cursor), 1).getTime();
    const chunkEnd = Math.min(end, nextMidnight);
    chunks.push({ date: toDateKey(cursor), ms: chunkEnd - cursor });
    cursor = chunkEnd;
  }
  return chunks;
}

/** Sums time per category over the local days [from, to). */
function totalsBetween(entries: readonly TimeEntry[], from: Millis, to: Millis, now: Millis): CategoryTotals {
  const totals: CategoryTotals = {};
  for (const entry of entries) {
    const start = Math.max(entry.start, from);
    const end = Math.min(effectiveEnd(entry, now), to);
    if (end <= start) continue;
    totals[entry.categoryId] = (totals[entry.categoryId] ?? 0) + (end - start);
  }
  return totals;
}

/** Time per category on a local day; entries crossing midnight count only their part of the day. */
export function dayTotals(entries: readonly TimeEntry[], day: DateKey, now: Millis): CategoryTotals {
  const from = fromDateKey(day);
  return totalsBetween(entries, from.getTime(), addDays(from, 1).getTime(), now);
}

/** Time per category in the Monday–Sunday week that contains `day`. */
export function weekTotals(entries: readonly TimeEntry[], day: DateKey, now: Millis): CategoryTotals {
  const monday = startOfWeek(fromDateKey(day), { weekStartsOn: 1 });
  return totalsBetween(entries, monday.getTime(), addDays(monday, 7).getTime(), now);
}

export type NewTimer = Pick<TimeEntry, 'categoryId' | 'taskId' | 'source'>;

export interface TimerStart {
  /** Running entries, now finished at the moment the new timer starts. */
  finished: TimeEntry[];
  /** The new running entry (without id and timestamps — the data layer adds them). */
  started: NewTimer & Pick<TimeEntry, 'start' | 'date'>;
}

/**
 * Starting a timer stops every running one at the same moment, so at most one timer runs.
 */
export function startTimer(entries: readonly TimeEntry[], timer: NewTimer, at: Millis): TimerStart {
  const finished = entries.filter((e) => e.end === undefined).map((e) => ({ ...e, end: at }));
  const started: TimerStart['started'] = {
    categoryId: timer.categoryId,
    source: timer.source,
    start: at,
    date: toDateKey(at),
  };
  if (timer.taskId !== undefined) started.taskId = timer.taskId;
  return { finished, started };
}
