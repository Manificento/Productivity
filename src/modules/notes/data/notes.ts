import { useLiveQuery } from 'dexie-react-hooks';
import { loadDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { db } from '../../../core/db';
import { shiftDateKey } from '../../../core/dates';
import { newRecord, touch } from '../../../core/ids';
import { dayTitle } from '../logic/notes';
import { buildPrepTemplate, prepTitle } from '../logic/template';
import type { DateKey, Id, LifeEvent, Note, Project } from '../../../core/types';

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

/** Creates the «подготовка к событию» page: the next 10 days of daily targets with the event as it is. */
export async function createPrepNote(event: LifeEvent, today: DateKey, now: number = Date.now()): Promise<Note> {
  const rows = await loadDailyTargetsRange(today, shiftDateKey(today, 9));
  const note: Note = newRecord(
    { title: prepTitle(event), body: buildPrepTemplate(event, rows), linkIds: [event.id] },
    now,
  );
  await db.notes.add(note);
  return note;
}

/** The page of a day: the existing one, or a new one titled with the date. */
export async function openDayNote(date: DateKey, now: number = Date.now()): Promise<Note> {
  const title = dayTitle(date);
  // The title is editable, so the page is the oldest note of the day whose title still starts with the date.
  return db.transaction('rw', db.notes, async () => {
    const existing = (await db.notes.where('linkIds').equals(date).sortBy('createdAt')).find((n) =>
      n.title.startsWith(title),
    );
    if (existing) return existing;
    const note: Note = newRecord({ title, body: '', linkIds: [date] }, now);
    await db.notes.add(note);
    return note;
  });
}
