import { shiftDateKey } from '../../../core/dates';
import type { DateKey, HabitLog, HabitSchedule } from '../../../core/types';
import { doneDays, isScheduled, isWeekly, weeklyQuota, weekStart } from './schedule';

export interface Streak {
  current: number;
  best: number;
  /** 'days' for daily / weekday habits, 'weeks' for «N раз в неделю». */
  unit: 'days' | 'weeks';
}

export interface HabitHistory {
  schedule: HabitSchedule;
  logs: readonly HabitLog[];
  /** First day the habit existed (local day of `createdAt`); earlier days are never counted as missed. */
  since: DateKey;
}

type Outcome = 'done' | 'missed' | 'pending' | 'skip';

/**
 * Walks periods (days or weeks) from `since` to `today` and classifies each:
 * done, missed, pending (the current period, not over yet and not done) or skip (not scheduled).
 */
function outcomes(h: HabitHistory, today: DateKey): Outcome[] {
  const done = doneDays(h.logs);
  const result: Outcome[] = [];
  if (isWeekly(h.schedule)) {
    const quota = weeklyQuota(h.schedule);
    const currentWeek = weekStart(today);
    for (let w = weekStart(h.since); w <= currentWeek; w = shiftDateKey(w, 7)) {
      let count = 0;
      for (let i = 0; i < 7; i++) if (done.has(shiftDateKey(w, i))) count++;
      result.push(count >= quota ? 'done' : w === currentWeek ? 'pending' : 'missed');
    }
    return result;
  }
  for (let d = h.since; d <= today; d = shiftDateKey(d, 1)) {
    if (!isScheduled(h.schedule, d)) result.push('skip');
    else if (done.has(d)) result.push('done');
    else result.push(d === today ? 'pending' : 'missed');
  }
  return result;
}

/**
 * Current and best streak. An unfinished current period (today / this week) never breaks the streak;
 * a missed scheduled period resets the current streak, the best one is kept.
 */
export function streak(h: HabitHistory, today: DateKey): Streak {
  const unit = isWeekly(h.schedule) ? 'weeks' : 'days';
  if (h.since > today) return { current: 0, best: 0, unit };
  let run = 0;
  let best = 0;
  for (const o of outcomes(h, today)) {
    if (o === 'done') best = Math.max(best, ++run);
    else if (o === 'missed') run = 0;
  }
  return { current: run, best, unit };
}

/**
 * Share of scheduled days done over the last `days` days (default 30), as a whole percent.
 * Today counts only once it is done, so an unfinished day does not lower the rate.
 * Weekly habits: done days against the pro-rated quota (N per 7 days), capped at 100%.
 */
export function completionRate(h: HabitHistory, today: DateKey, days = 30): number {
  const done = doneDays(h.logs);
  const end = done.has(today) ? today : shiftDateKey(today, -1);
  let start = shiftDateKey(end, -(days - 1));
  if (start < h.since) start = h.since;
  if (start > end) return 0;

  let scheduled = 0;
  let hit = 0;
  let span = 0;
  for (let d = start; d <= end; d = shiftDateKey(d, 1)) {
    span++;
    if (isScheduled(h.schedule, d)) scheduled++;
    if (done.has(d) && isScheduled(h.schedule, d)) hit++;
  }
  if (isWeekly(h.schedule)) {
    const expected = (weeklyQuota(h.schedule) * span) / 7;
    return Math.min(100, Math.round((hit / expected) * 100));
  }
  return scheduled === 0 ? 0 : Math.round((hit / scheduled) * 100);
}
