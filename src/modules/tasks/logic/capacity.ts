import { shiftDateKey } from '../../../core/dates';
import type { DateKey, Id, Task } from '../../../core/types';
import { todayList } from './lists';

/** Minutes assumed for a task without an estimate. */
export const DEFAULT_ESTIMATE_MIN = 30;

export interface Plan {
  plannedMin: number;
  capacityMin: number;
  /** Tasks counted with DEFAULT_ESTIMATE_MIN. */
  unestimated: number;
  over: boolean;
}

/** Planned minutes of `tasks` against the day's capacity (from DailyTargets). */
export function planFor(tasks: Task[], capacityMin: number): Plan {
  const plannedMin = tasks.reduce((sum, t) => sum + (t.estimateMin ?? DEFAULT_ESTIMATE_MIN), 0);
  const unestimated = tasks.filter((t) => t.estimateMin === undefined).length;
  return { plannedMin, capacityMin, unestimated, over: plannedMin > capacityMin };
}

/** Tasks of the focus project first; the order inside both groups is kept. */
export function focusFirst(tasks: Task[], focusProjectId: Id | undefined): Task[] {
  if (!focusProjectId) return tasks;
  const isFocus = (t: Task) => t.projectId === focusProjectId;
  return [...tasks.filter(isFocus), ...tasks.filter((t) => !isFocus(t))];
}

/**
 * Today's (and overdue) open tasks of priority 3–4 — the ones «Перенести P3–P4» moves.
 * Tasks of the focus project stay: they are the preparation for the event itself.
 */
export function deferrable(tasks: Task[], today: DateKey, focusProjectId?: Id): Task[] {
  return todayList(tasks, today).filter(
    (t) => t.priority >= 3 && (focusProjectId === undefined || t.projectId !== focusProjectId),
  );
}

/** Where deferred tasks go: the day after the active event, or tomorrow — never earlier than tomorrow. */
export function deferDate(today: DateKey, eventDate: DateKey | undefined): DateKey {
  const tomorrow = shiftDateKey(today, 1);
  if (eventDate === undefined) return tomorrow;
  const after = shiftDateKey(eventDate, 1);
  return after > tomorrow ? after : tomorrow;
}
