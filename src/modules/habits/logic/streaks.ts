import { shiftDateKey } from '../../../core/dates';
import type { DateKey, HabitLog, HabitSchedule } from '../../../core/types';
import { doneDays, isScheduled, isWeekly, weeklyQuota, weekStart } from '../../../core/habitSchedule';

export interface Streak {
  current: number;
  best: number;
  /** 'days' for daily / weekday habits, 'weeks' for «N раз в неделю». */
  unit: 'days' | 'weeks';
}

export interface HabitHistory {
  schedule: HabitSchedule;
  logs: readonly HabitLog[];
  /**
   * First day the habit existed (local day of `createdAt`); earlier days are never counted as missed.
   * A back-filled log before it moves the start back automatically.
   */
  since: DateKey;
  /**
   * Days when this habit does not count (режим «только ключевые», habit is not essential):
   * a missed scheduled day in the set neither breaks the streak nor lowers the rate.
   */
  relaxed?: ReadonlySet<DateKey>;
}

/**
 * Done days up to `today` (future marks never count) and the effective first day
 * (a back-filled mark before `since` moves it back). Shared by streaks, rates and the calendar.
 */
export function prepare(h: HabitHistory, today: DateKey): { done: Set<DateKey>; since: DateKey } {
  const done = new Set([...doneDays(h.logs)].filter((d) => d <= today));
  let since = h.since;
  for (const d of done) if (d < since) since = d;
  return { done, since };
}

export function doneInWeek(done: Set<DateKey>, monday: DateKey): number {
  let count = 0;
  for (let i = 0; i < 7; i++) if (done.has(shiftDateKey(monday, i))) count++;
  return count;
}

function weekHasRelaxed(h: HabitHistory, monday: DateKey): boolean {
  for (let i = 0; i < 7; i++) if (h.relaxed?.has(shiftDateKey(monday, i))) return true;
  return false;
}

type Outcome = 'done' | 'missed' | 'pending' | 'skip';

/**
 * Walks periods (days or weeks) from `since` to `today` and classifies each:
 * done, missed, pending (the current period, not over yet and not done) or skip (not scheduled).
 */
function outcomes(h: HabitHistory, today: DateKey): Outcome[] {
  const { done, since } = prepare(h, today);
  const result: Outcome[] = [];
  if (isWeekly(h.schedule)) {
    const quota = weeklyQuota(h.schedule);
    const currentWeek = weekStart(today);
    for (let w = weekStart(since); w <= currentWeek; w = shiftDateKey(w, 7)) {
      if (doneInWeek(done, w) >= quota) result.push('done');
      else if (w === currentWeek) result.push('pending');
      else result.push(weekHasRelaxed(h, w) ? 'skip' : 'missed');
    }
    return result;
  }
  for (let d = since; d <= today; d = shiftDateKey(d, 1)) {
    if (!isScheduled(h.schedule, d)) result.push('skip');
    else if (done.has(d)) result.push('done');
    else if (h.relaxed?.has(d)) result.push('skip');
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
  if (prepare(h, today).since > today) return { current: 0, best: 0, unit };
  let run = 0;
  let best = 0;
  for (const o of outcomes(h, today)) {
    if (o === 'done') best = Math.max(best, ++run);
    else if (o === 'missed') run = 0;
  }
  return { current: run, best, unit };
}

/**
 * Share of the plan done over the last `days` days (default 30), as a whole percent.
 * - Daily / weekday habits: done scheduled days ÷ scheduled days. Today counts only once it is done.
 * - «N раз в неделю»: whole Mon–Sun weeks touching the window, each worth min(done, N) ÷ N, so extra days
 *   in one week never cover a missed week. The current week counts only once its quota is met.
 * An unfinished current period therefore never lowers the rate.
 */
export function completionRate(h: HabitHistory, today: DateKey, days = 30): number {
  const { done, since } = prepare(h, today);

  if (isWeekly(h.schedule)) {
    const quota = weeklyQuota(h.schedule);
    const currentWeek = weekStart(today);
    const firstDay = shiftDateKey(today, -(days - 1));
    let first = weekStart(firstDay < since ? since : firstDay);
    let got = 0;
    let weeks = 0;
    for (; first <= currentWeek; first = shiftDateKey(first, 7)) {
      const count = Math.min(doneInWeek(done, first), quota);
      if (first === currentWeek && count < quota) continue;
      got += count;
      weeks++;
    }
    return weeks === 0 ? 0 : Math.round((got / (quota * weeks)) * 100);
  }

  const end = done.has(today) ? today : shiftDateKey(today, -1);
  let start = shiftDateKey(end, -(days - 1));
  if (start < since) start = since;
  let scheduled = 0;
  let hit = 0;
  for (let d = start; d <= end; d = shiftDateKey(d, 1)) {
    if (!isScheduled(h.schedule, d)) continue;
    if (!done.has(d) && h.relaxed?.has(d)) continue;
    scheduled++;
    if (done.has(d)) hit++;
  }
  return scheduled === 0 ? 0 : Math.round((hit / scheduled) * 100);
}
