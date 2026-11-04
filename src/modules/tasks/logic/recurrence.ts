import { addMonths, getDay, getDaysInMonth, setDate, startOfMonth } from 'date-fns';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import type { DateKey, Recurrence, Task } from '../../../core/types';

/** The due date after `dueDate` for a repeating task. */
export function nextDueDate(recurrence: Recurrence, dueDate: DateKey): DateKey {
  switch (recurrence.kind) {
    case 'daily':
      return shiftDateKey(dueDate, 1);
    case 'everyNDays':
      return shiftDateKey(dueDate, Math.max(1, Math.floor(recurrence.interval ?? 1) || 1));
    case 'monthly': {
      // Next month on the anchor day, clamped to the month's last day: 31 Jan → 28/29 Feb → 31 Mar.
      const next = addMonths(startOfMonth(fromDateKey(dueDate)), 1);
      return toDateKey(setDate(next, Math.min(monthlyAnchor(recurrence, dueDate), getDaysInMonth(next))));
    }
    default: {
      const days = recurrence.weekdays?.length ? recurrence.weekdays : [getDay(fromDateKey(dueDate))];
      const from = getDay(fromDateKey(dueDate));
      // 1…7 days ahead: the same weekday counts only a week later.
      const ahead = Math.min(...days.map((d) => ((d - from + 6) % 7) + 1));
      return shiftDateKey(dueDate, ahead);
    }
  }
}

/**
 * The day of month a monthly repeat aims at. The stored anchor counts only while `dueDate` is on it (or on the
 * last day of a shorter month); a date moved by hand, an invalid value or an old record without one fall back
 * to the due date's own day.
 */
function monthlyAnchor(recurrence: Recurrence, dueDate: DateKey): number {
  const due = fromDateKey(dueDate);
  const day = due.getDate();
  const a = recurrence.dayOfMonth;
  if (a === undefined || !Number.isInteger(a) || a < 1 || a > 31) return day;
  const last = getDaysInMonth(due);
  return a === day || (day === last && a > last) ? a : day;
}

type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Fields of the copy created when a repeating task is completed on `completedDay`: everything but the
 * completion, due on the next date after the due date that is still in the future — completing an overdue
 * daily task gives tomorrow, not another overdue copy. A task without a due date repeats from the completion day.
 */
export function nextOccurrence(task: Task, completedDay: DateKey): NewTask | undefined {
  const { recurrence } = task;
  if (!recurrence) return undefined;
  const { id: _id, createdAt: _c, updatedAt: _u, completedAt: _done, ...fields } = task;
  let dueDate = nextDueDate(recurrence, task.dueDate ?? completedDay);
  while (dueDate <= completedDay) dueDate = nextDueDate(recurrence, dueDate);
  return { ...fields, dueDate };
}

/**
 * Whether `candidate` is the still-open copy created when `original` was completed. The copy is
 * created in the same moment the original is completed, so its createdAt equals original.completedAt.
 * The title is deliberately not compared: either task may be renamed later (#6).
 */
export function isNextCopyOf(candidate: Task, original: Task): boolean {
  return (
    candidate.id !== original.id &&
    original.completedAt !== undefined &&
    candidate.completedAt === undefined &&
    candidate.createdAt === original.completedAt &&
    candidate.recurrence !== undefined
  );
}
