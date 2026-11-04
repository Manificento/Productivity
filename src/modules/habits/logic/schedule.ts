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

/** Weekly quota (at least 1). */
export function weeklyQuota(schedule: HabitSchedule): number {
  return Math.max(1, schedule.timesPerWeek ?? 1);
}
