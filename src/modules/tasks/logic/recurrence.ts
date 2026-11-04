import { addMonths, getDay } from 'date-fns';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import type { DateKey, Recurrence, Task } from '../../../core/types';

/** The due date after `dueDate` for a repeating task. */
export function nextDueDate(recurrence: Recurrence, dueDate: DateKey): DateKey {
  switch (recurrence.kind) {
    case 'daily':
      return shiftDateKey(dueDate, 1);
    case 'everyNDays':
      return shiftDateKey(dueDate, Math.max(1, recurrence.interval ?? 1));
    case 'monthly':
      // date-fns clamps to the month's last day: 31 Jan → 28/29 Feb.
      return toDateKey(addMonths(fromDateKey(dueDate), 1));
    default: {
      const days = recurrence.weekdays?.length ? recurrence.weekdays : [getDay(fromDateKey(dueDate))];
      const from = getDay(fromDateKey(dueDate));
      // 1…7 days ahead: the same weekday counts only a week later.
      const ahead = Math.min(...days.map((d) => ((d - from + 6) % 7) + 1));
      return shiftDateKey(dueDate, ahead);
    }
  }
}

type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Fields of the copy created when a repeating task is completed on `completedDay`: everything but the
 * completion, due on the next date. A task without a due date repeats from the completion day.
 */
export function nextOccurrence(task: Task, completedDay: DateKey): NewTask | undefined {
  if (!task.recurrence) return undefined;
  const { id: _id, createdAt: _c, updatedAt: _u, completedAt: _done, ...fields } = task;
  return { ...fields, dueDate: nextDueDate(task.recurrence, task.dueDate ?? completedDay) };
}

/**
 * Whether `candidate` is the still-open copy created when `original` was completed. The copy is
 * created in the same moment the original is completed, so its createdAt equals original.completedAt.
 */
export function isNextCopyOf(candidate: Task, original: Task): boolean {
  return (
    candidate.id !== original.id &&
    original.completedAt !== undefined &&
    candidate.completedAt === undefined &&
    candidate.createdAt === original.completedAt &&
    candidate.title === original.title &&
    candidate.recurrence !== undefined
  );
}
