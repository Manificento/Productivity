import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, Task } from '../../../core/types';
import { validateTitle } from '../logic/tasks';

type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/** Creates an inbox task (no due date) with the default priority 4. Returns its id. */
export async function addTask(title: string, now: number = Date.now()): Promise<Id> {
  const error = validateTitle(title);
  if (error) throw new Error(error);
  const task: Task = newRecord<NewTask>({ title: title.trim(), priority: 4, tags: [] }, now);
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
