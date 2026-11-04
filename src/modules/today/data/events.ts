import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, LifeEvent, Project } from '../../../core/types';
import type { EventFields } from '../logic/events';

export async function createEvent(fields: EventFields, now: number = Date.now()): Promise<Id> {
  const record = newRecord(fields, now);
  await db.lifeEvents.add(record);
  return record.id;
}

/** Replaces the user-editable fields, so optional fields cleared in the form are removed. */
export async function updateEvent(id: Id, fields: EventFields, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.lifeEvents, async () => {
    const current = await db.lifeEvents.get(id);
    if (!current) throw new Error('Событие не найдено');
    await db.lifeEvents.put({ ...touch(fields, now), id, createdAt: current.createdAt });
  });
}

export async function deleteEvent(id: Id): Promise<void> {
  await db.lifeEvents.delete(id);
}

export function useEvents(): LifeEvent[] | undefined {
  return useLiveQuery(() => db.lifeEvents.toArray(), []);
}

/** `null` when the event does not exist, `undefined` while loading. */
export function useEvent(id: Id): LifeEvent | null | undefined {
  return useLiveQuery(async () => (await db.lifeEvents.get(id)) ?? null, [id]);
}

/** Active task projects (read-only: the tasks module owns this table). */
export function useProjects(): Project[] | undefined {
  return useLiveQuery(async () => (await db.projects.toArray()).filter((p) => !p.archived), []);
}
