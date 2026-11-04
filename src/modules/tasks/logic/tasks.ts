import { toDateKey } from '../../../core/dates';
import type { DateKey, Task } from '../../../core/types';

/** Error text for an invalid task title, or undefined when the title is fine. */
export function validateTitle(title: string): string | undefined {
  return title.trim() === '' ? 'Введите название задачи' : undefined;
}

/** Tasks completed on the local day `date`, most recently completed first. */
export function completedOn(tasks: Task[], date: DateKey): Task[] {
  return tasks
    .filter((t) => t.completedAt !== undefined && toDateKey(t.completedAt) === date)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
