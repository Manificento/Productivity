import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, Task } from '../../../core/types';
import { validateTitle } from '../logic/tasks';

type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/** What a new task needs: a title, optionally a due date and a project. */
export type TaskDraft = Pick<NewTask, 'title'> & Partial<Pick<NewTask, 'dueDate' | 'projectId'>>;

/** Creates a task with the default priority 4 (no due date → «Входящие»). Returns its id. */
export async function addTask(draft: TaskDraft, now: number = Date.now()): Promise<Id> {
  const error = validateTitle(draft.title);
  if (error) throw new Error(error);
  const task: Task = newRecord<NewTask>({ priority: 4, tags: [], ...draft, title: draft.title.trim() }, now);
  await db.tasks.add(task);
  return task.id;
}

/** Marks a task done (sets completedAt) or, if it is done, reopens it (clears completedAt). */
export async function toggleTask(id: Id, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    const { completedAt, ...rest } = task;
    await db.tasks.put(completedAt === undefined ? { ...task, ...touch({ completedAt: now }, now) } : touch(rest, now));
  });
}

export async function deleteTask(id: Id): Promise<void> {
  await db.tasks.delete(id);
}

/** Live list of all tasks; undefined while loading. */
export function useAllTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.toArray(), []);
}
