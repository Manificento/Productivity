import type { DateKey, Id, Priority, Recurrence } from '../../../core/types';
import { withImpliedDates, type ParsedTask } from './quickAdd';

/** List defaults for a new task: due day of «Сегодня»/«Предстоящие», the open project. */
export interface ListDefaults {
  dueDate?: DateKey;
  projectId?: Id;
}

/** Everything needed to create a task, except resolving `projectName` to a project. */
export interface QuickDraft {
  title: string;
  dueDate?: DateKey;
  dueTime?: string;
  projectId?: Id;
  /** Set when the line named a project with «#…»; it wins over `projectId`. */
  projectName?: string;
  priority: Priority;
  tags: string[];
  estimateMin?: number;
  recurrence?: Recurrence;
}

/** Copy of `o` without the keys whose value is undefined, so stored records stay minimal. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Merges a line parsed with `parseQuickAddExplicit` with the list's defaults: what was typed wins,
 * priority defaults to 4. A time or a repeat without a date starts on the list's day (or `today`).
 */
export function draftFromQuickAdd(parsed: ParsedTask, today: DateKey, defaults: ListDefaults = {}): QuickDraft {
  const dated = withImpliedDates(parsed, defaults.dueDate ?? today);
  return compact<QuickDraft>({
    title: parsed.title,
    dueDate: dated.dueDate ?? defaults.dueDate,
    dueTime: parsed.dueTime,
    projectId: parsed.projectName ? undefined : defaults.projectId,
    projectName: parsed.projectName,
    priority: parsed.priority ?? 4,
    tags: parsed.tags,
    estimateMin: parsed.estimateMin,
    recurrence: dated.recurrence,
  });
}
