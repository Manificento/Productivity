import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, Project } from '../../../core/types';
import { validateProjectName } from '../logic/projects';

async function checkName(name: string, selfId?: Id): Promise<void> {
  const error = validateProjectName(name, await db.projects.toArray(), selfId);
  if (error) throw new Error(error);
}

/** Creates a project. Throws with a Russian message when the name is empty or taken. */
export async function addProject(name: string, now: number = Date.now()): Promise<Id> {
  return db.transaction('rw', db.projects, async () => {
    await checkName(name);
    const project: Project = newRecord<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>(
      { name: name.trim(), archived: false },
      now,
    );
    await db.projects.add(project);
    return project.id;
  });
}

export async function renameProject(id: Id, name: string, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    await checkName(name, id);
    await db.projects.update(id, touch({ name: name.trim() }, now));
  });
}

export async function setProjectArchived(id: Id, archived: boolean, now: number = Date.now()): Promise<void> {
  await db.projects.update(id, touch({ archived }, now));
}

/** Live list of all projects (archived included); undefined while loading. */
export function useProjects(): Project[] | undefined {
  return useLiveQuery(() => db.projects.toArray(), []);
}
