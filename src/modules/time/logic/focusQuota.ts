import type { DateKey, Id, Millis, Task, TimeEntry } from '../../../core/types';

export type FocusQuota =
  | { kind: 'quota'; done: number; target: number }
  /** The adaptation says: no focus sessions today (e.g. the event day). `reasons` explain why. */
  | { kind: 'none'; done: number; reasons: string[] };

/**
 * Focus sessions done on `day`: Pomodoro entries lasting at least half of the current focus length,
 * so a session stopped after a few minutes does not count as a full one.
 */
export function countFocusSessions(entries: readonly TimeEntry[], day: DateKey, workMin: number): number {
  const minMs: Millis = (workMin * 60_000) / 2;
  return entries.filter(
    (e) => e.source === 'pomodoro' && e.date === day && e.end !== undefined && e.end - e.start >= minMs,
  ).length;
}

export function focusQuota(targets: { focusPomodoros: number; reasons: string[] }, done: number): FocusQuota {
  return targets.focusPomodoros <= 0
    ? { kind: 'none', done, reasons: targets.reasons }
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
