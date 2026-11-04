import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, Project, Task } from '../../../core/types';
import { findActiveProject } from '../logic/projects';
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
