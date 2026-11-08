import { db } from '../../../core/db';
import { importTasks, type ImportTasksResult } from '../../../core/logging/tasks';
import type { TodoistPreview } from '../logic/todoistCsv';

/** Запись разобранного CSV Todoist — только через `importTasks()`. */
export function importTodoist(preview: TodoistPreview): Promise<ImportTasksResult> {
  return importTasks({ projects: [preview.project], tasks: preview.tasks }, { source: 'todoist' });
}

/**
 * Сколько задач файла уже выполнены в LifeOS (только чтение). Повторный импорт их не переоткроет (#194):
 * `importTasks` обновляет открытую копию, если она есть, — поэтому задача считается выполненной,
 * только когда все её записи с тем же ключом выполнены.
 */
export async function countCompletedInApp(preview: TodoistPreview): Promise<number> {
  const ids = preview.tasks.flatMap((t) => (t.externalId !== undefined ? [t.externalId] : []));
  if (ids.length === 0) return 0;
  const found = await db.tasks
    .where('[source+externalId]')
    .anyOf(ids.map((id) => ['todoist', id]))
    .toArray();
  const open = new Map<string, boolean>();
  for (const t of found) {
    if (t.externalId === undefined) continue;
    open.set(t.externalId, (open.get(t.externalId) ?? false) || t.completedAt === undefined);
  }
  return [...open.values()].filter((isOpen) => !isOpen).length;
}
