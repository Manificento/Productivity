import type { DateKey, Id, Millis, Task, TimeEntry } from '../../../core/types';

export type FocusQuota =
  | { kind: 'quota'; done: number; target: number }
  /** The adaptation says: no focus sessions today (e.g. the event day). `reasons` explain why. */
  | { kind: 'none'; reasons: string[] };

/**
 * A Pomodoro entry counts as a focus session from this length on. Fixed (not tied to the current
 * focus setting), so changing the setting never rewrites sessions already done today.
 */
export const MIN_FOCUS_SESSION_MS: Millis = 10 * 60_000;

/**
 * Focus sessions done on `day`. An entry belongs to the day it started (`date`), like all time entries:
 * a 23:50–00:15 session counts for the evening it began.
 */
export function countFocusSessions(entries: readonly TimeEntry[], day: DateKey): number {
  return entries.filter(
    (e) => e.source === 'pomodoro' && e.date === day && e.end !== undefined && e.end - e.start >= MIN_FOCUS_SESSION_MS,
  ).length;
}

export function focusQuota(targets: { focusPomodoros: number; reasons: string[] }, done: number): FocusQuota {
  return targets.focusPomodoros <= 0
    ? { kind: 'none', reasons: targets.reasons }
    : { kind: 'quota', done, target: targets.focusPomodoros };
}

/** Tasks of the day's focus project first; the original order is kept otherwise. */
export function focusProjectFirst<T extends Pick<Task, 'projectId'>>(tasks: readonly T[], focusProjectId?: Id): T[] {
  if (!focusProjectId) return [...tasks];
  return [
    ...tasks.filter((t) => t.projectId === focusProjectId),
    ...tasks.filter((t) => t.projectId !== focusProjectId),
  ];
}
