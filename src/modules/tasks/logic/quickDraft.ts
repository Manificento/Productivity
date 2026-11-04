import type { DateKey, Id, Priority, Recurrence } from '../../../core/types';
import type { ParsedTask } from './quickAdd';

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

/** Merges a parsed line with the list's defaults: what was typed wins, priority defaults to 4. */
export function draftFromQuickAdd(parsed: ParsedTask, defaults: ListDefaults = {}): QuickDraft {
  const draft: QuickDraft = {
    title: parsed.title,
    dueDate: parsed.dueDate ?? defaults.dueDate,
    dueTime: parsed.dueTime,
    projectId: parsed.projectName ? undefined : defaults.projectId,
    projectName: parsed.projectName,
    priority: parsed.priority ?? 4,
    tags: parsed.tags,
    estimateMin: parsed.estimateMin,
    recurrence: parsed.recurrence,
  };
  // Drop absent fields so stored records stay minimal.
  return Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined)) as unknown as QuickDraft;
}
