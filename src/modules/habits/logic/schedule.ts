import { startOfWeek } from 'date-fns';
import { fromDateKey, toDateKey } from '../../../core/dates';
import type { DateKey, HabitLog, HabitSchedule } from '../../../core/types';

/** Whether the habit is planned on `day`. «N раз в неделю» can be done on any day. */
export function isScheduled(schedule: HabitSchedule, day: DateKey): boolean {
  if (schedule.kind !== 'weekdays') return true;
  return (schedule.weekdays ?? []).includes(fromDateKey(day).getDay());
}

/** Habits counted in weeks (Mon–Sun with a quota) instead of days. */
export function isWeekly(schedule: HabitSchedule): boolean {
  return schedule.kind === 'timesPerWeek';
}

/** Monday of the week containing `day`. */
export function weekStart(day: DateKey): DateKey {
  return toDateKey(startOfWeek(fromDateKey(day), { weekStartsOn: 1 }));
}

/**
 * Days marked done. If a day has several logs (re-toggled), the latest one wins.
 */
export function doneDays(logs: readonly HabitLog[]): Set<DateKey> {
  const latest = new Map<DateKey, HabitLog>();
  for (const log of logs) {
    const prev = latest.get(log.date);
    if (!prev || log.updatedAt >= prev.updatedAt) latest.set(log.date, log);
  }
  return new Set([...latest.values()].filter((l) => l.done).map((l) => l.date));
}

/** Weekly quota: a whole number 1…7 (bad or missing values, e.g. from an import, fall back to 1). */
export function weeklyQuota(schedule: HabitSchedule): number {
  const n = schedule.timesPerWeek;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
  return Math.min(7, Math.max(1, Math.floor(n)));
}
