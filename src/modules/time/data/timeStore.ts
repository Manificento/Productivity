import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { Id, Millis, TimeCategory, TimeEntry } from '../../../core/types';
import { DEFAULT_CATEGORY_NAMES, type ManualEntry } from '../logic/timer';
import { startTimer, type NewTimer } from '../logic/totals';

const DEFAULT_COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7'];

/** Active categories in creation order. */
export async function listCategories(): Promise<TimeCategory[]> {
  const all = await db.timeCategories.toArray();
  return all.filter((c) => !c.archived).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
}

/** Creates the starter set (Учёба, Работа, …) unless categories already exist. */
export async function createDefaultCategories(now: Millis = Date.now()): Promise<void> {
  await db.transaction('rw', db.timeCategories, async () => {
    if ((await db.timeCategories.filter((c) => !c.archived).count()) > 0) return;
    await db.timeCategories.bulkAdd(
      DEFAULT_CATEGORY_NAMES.map((name, i) =>
        newRecord({ name, color: DEFAULT_COLORS[i % DEFAULT_COLORS.length], archived: false }, now + i),
      ),
    );
  });
}

/**
 * Entries without `end`. Normally zero or one. A full scan is accepted for now:
 * IndexedDB cannot index a missing `end`, and history stays small for one person.
 */
export async function runningEntries(): Promise<TimeEntry[]> {
  return (await db.timeEntries.toArray()).filter((e) => e.end === undefined);
}

/**
 * Starts a timer; any running timer is finished at the same moment. Returns the running entry id.
 * Starting the timer that is already running (e.g. a double tap) changes nothing.
 */
export async function startCategoryTimer(timer: NewTimer, now: Millis = Date.now()): Promise<Id> {
  return db.transaction('rw', db.timeEntries, async () => {
    const running = await runningEntries();
    const same = running.length === 1 ? running[0] : undefined;
    if (same && same.categoryId === timer.categoryId && same.taskId === timer.taskId) return same.id;
    const { finished, started } = startTimer(running, timer, now);
    await db.timeEntries.bulkPut(finished.map((e) => ({ ...e, ...touch({}, now) })));
    const entry = newRecord(started, now);
    await db.timeEntries.add(entry);
    return entry.id;
  });
}

/** Stops a running timer. */
export async function stopTimer(id: Id, now: Millis = Date.now()): Promise<void> {
  await db.transaction('rw', db.timeEntries, async () => {
    const entry = await db.timeEntries.get(id);
    if (!entry || entry.end !== undefined) return;
    await db.timeEntries.update(id, touch({ end: Math.max(now, entry.start) }, now));
  });
}

export async function addManualEntry(entry: ManualEntry, now: Millis = Date.now()): Promise<Id> {
  const record = newRecord({ ...entry, source: 'manual' as const }, now);
  await db.timeEntries.add(record);
  return record.id;
}

export function useCategories(): TimeCategory[] | undefined {
  return useLiveQuery(listCategories, []);
}

/** The running entry (the latest one if data somehow has several), `null` when none. */
export function useRunningEntry(): TimeEntry | null | undefined {
  return useLiveQuery(async () => {
    const running = await runningEntries();
    return running.sort((a, b) => b.start - a.start)[0] ?? null;
  }, []);
}
