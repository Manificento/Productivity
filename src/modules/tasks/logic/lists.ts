import { toDateKey } from '../../../core/dates';
import type { DateKey, Id, Task } from '../../../core/types';

/**
 * Pure list views over tasks. `today` is always passed in (never read from the clock),
 * so every view is deterministic and testable without a database.
 */

const isActive = (t: Task) => t.completedAt === undefined;

export function isOverdue(task: Task, today: DateKey): boolean {
  return isActive(task) && task.dueDate !== undefined && task.dueDate < today;
}

/**
 * Sort order for every list: overdue → priority 1…4 → due date and time (earlier first, undated last;
 * on one day timed tasks come first) → creation date.
 */
export function compareTasks(today: DateKey): (a: Task, b: Task) => number {
  return (a, b) =>
    Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
    a.priority - b.priority ||
    compareOptional(a.dueDate, b.dueDate) ||
    compareOptional(a.dueTime, b.dueTime) ||
    a.createdAt - b.createdAt;
}

/** Ascending; undefined sorts last. */
function compareOptional(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : 1;
}

function sorted(tasks: Task[], today: DateKey): Task[] {
  return [...tasks].sort(compareTasks(today));
}

/** «Сегодня»: active tasks due today or earlier (overdue first). */
export function todayList(tasks: Task[], today: DateKey): Task[] {
  return sorted(
    tasks.filter((t) => isActive(t) && t.dueDate !== undefined && t.dueDate <= today),
    today,
  );
}

export interface DayGroup {
  date: DateKey;
  tasks: Task[];
}

/** «Предстоящие»: active tasks due after today, grouped by day, earliest day first. */
export function upcomingGroups(tasks: Task[], today: DateKey): DayGroup[] {
  const byDay = new Map<DateKey, Task[]>();
  for (const t of tasks) {
    if (!isActive(t) || t.dueDate === undefined || t.dueDate <= today) continue;
    byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t]);
  }
  return [...byDay.keys()].sort().map((date) => ({ date, tasks: sorted(byDay.get(date) ?? [], today) }));
}

/** «Входящие»: active tasks without a due date. */
export function inboxList(tasks: Task[], today: DateKey): Task[] {
  return sorted(
    tasks.filter((t) => isActive(t) && t.dueDate === undefined),
    today,
  );
}

/** Active tasks of one project. */
export function projectList(tasks: Task[], projectId: Id, today: DateKey): Task[] {
  return sorted(
    tasks.filter((t) => isActive(t) && t.projectId === projectId),
    today,
  );
}

/** Archive: completed tasks grouped by the local day they were completed, newest day and task first. */
export function completedGroups(tasks: Task[]): DayGroup[] {
  const byDay = new Map<DateKey, Task[]>();
  const done = tasks
    .filter((t) => t.completedAt !== undefined)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  for (const t of done) {
    const day = toDateKey(t.completedAt ?? 0);
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  return [...byDay.entries()].map(([date, list]) => ({ date, tasks: list }));
}
