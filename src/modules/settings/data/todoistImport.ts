import { importTasks, type ImportTasksResult } from '../../../core/logging/tasks';
import type { TodoistPreview } from '../logic/todoistCsv';

/** Запись разобранного CSV Todoist — только через `importTasks()`. */
export function importTodoist(preview: TodoistPreview): Promise<ImportTasksResult> {
  return importTasks({ projects: [preview.project], tasks: preview.tasks }, { source: 'todoist' });
}
