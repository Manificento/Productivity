import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, LifeEvent, Note, Project } from '../../../core/types';

export async function addNote(now: number = Date.now()): Promise<Note> {
  const note: Note = newRecord({ title: '', body: '', linkIds: [] as string[] }, now);
  await db.notes.add(note);
  return note;
}

export async function saveNote(
  id: Id,
  patch: Partial<Pick<Note, 'title' | 'body' | 'linkIds'>>,
  now: number = Date.now(),
): Promise<void> {
  await db.notes.update(id, touch(patch, now));
}

export async function deleteNote(id: Id): Promise<void> {
  await db.notes.delete(id);
}

/** Live list of notes; undefined while loading. */
export function useNotes(): Note[] | undefined {
  return useLiveQuery(() => db.notes.toArray(), []);
}

/** Projects and events a note can be linked to (read-only). */
export function useLinkTargets(): { projects: Project[]; events: LifeEvent[] } | undefined {
  return useLiveQuery(async () => {
    const [projects, events] = await Promise.all([db.projects.toArray(), db.lifeEvents.toArray()]);
    return {
      projects: projects.filter((p) => !p.archived),
      events: events.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, []);
}
