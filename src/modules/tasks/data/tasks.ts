import { useLiveQuery } from 'dexie-react-hooks';
import { toDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, Project, Task } from '../../../core/types';
import { findActiveProject } from '../logic/projects';
import { isNextCopyOf, nextOccurrence } from '../logic/recurrence';
import type { QuickDraft } from '../logic/quickDraft';
import { validateTitle } from '../logic/tasks';

type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/** What a new task needs: a title; everything else is optional. */
export type TaskDraft = Pick<NewTask, 'title'> & Partial<Omit<NewTask, 'title'>>;

/** Creates a task with the default priority 4 (no due date → «Входящие»). Returns its id. */
export async function addTask(draft: TaskDraft, now: number = Date.now()): Promise<Id> {
  const error = validateTitle(draft.title);
  if (error) throw new Error(error);
  const task: Task = newRecord<NewTask>({ priority: 4, tags: [], ...draft, title: draft.title.trim() }, now);
  await db.tasks.add(task);
  return task.id;
}

/**
 * Saves a quick add line. A «#проект» is matched to an active project ignoring case;
 * if there is none, the project is created. Task and project are written in one transaction.
 */
export async function addQuickTask(draft: QuickDraft, now: number = Date.now()): Promise<Id> {
  const error = validateTitle(draft.title);
  if (error) throw new Error(error);
  return db.transaction('rw', db.tasks, db.projects, async () => {
    const { projectName, ...rest } = draft;
    let projectId = rest.projectId;
    if (projectName) {
      const existing = findActiveProject(await db.projects.toArray(), projectName);
      projectId = existing?.id;
      if (!projectId) {
        const project: Project = newRecord<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>(
          { name: projectName.trim(), archived: false },
          now,
        );
        await db.projects.add(project);
        projectId = project.id;
      }
    }
    return addTask(projectId ? { ...rest, projectId } : rest, now);
  });
}

/**
 * Marks a task done (sets completedAt) or, if it is done, reopens it (clears completedAt).
 * Completing a repeating task creates its next copy; reopening it removes that copy while it is still open.
 */
export async function toggleTask(id: Id, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    if (task.completedAt === undefined) {
      await db.tasks.put({ ...task, ...touch({ completedAt: now }, now) });
      const next = nextOccurrence(task, toDateKey(now));
      // Completing, reopening and completing again must not start a second chain next to a kept copy.
      const already =
        next &&
        (await db.tasks
          .where('dueDate')
          .equals(next.dueDate ?? '')
          .filter((t) => t.id !== task.id && t.recurrence !== undefined && t.title === task.title)
          .count());
      if (next && !already) await db.tasks.add(newRecord(next, now));
      return;
    }
    const copyDate = nextOccurrence(task, toDateKey(task.completedAt))?.dueDate;
    if (copyDate) {
      const open = await db.tasks
        .where('dueDate')
        .equals(copyDate)
        .filter((t) => isNextCopyOf(t, task))
        .primaryKeys();
      await db.tasks.bulkDelete(open);
    }
    const { completedAt: _done, ...reopened } = task;
    await db.tasks.put(touch(reopened, now));
  });
}

export async function deleteTask(id: Id): Promise<void> {
  await db.tasks.delete(id);
}

/** Live list of all tasks; undefined while loading. */
export function useAllTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.toArray(), []);
}
