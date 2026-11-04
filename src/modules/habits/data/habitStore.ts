import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { DateKey, Habit, HabitLog, Id, Millis } from '../../../core/types';
import type { HabitFields } from '../logic/habitForm';

export function useHabits(): Habit[] | undefined {
  return useLiveQuery(() => db.habits.toArray(), []);
}

/** All habit logs. One person's history stays small (a few thousand rows a year). */
export function useHabitLogs(): HabitLog[] | undefined {
  return useLiveQuery(() => db.habitLogs.toArray(), []);
}

export async function createHabit(fields: HabitFields, now: Millis = Date.now()): Promise<Id> {
  const habit = newRecord({ ...fields, archived: false }, now);
  await db.habits.add(habit);
  return habit.id;
}

export async function updateHabit(id: Id, fields: HabitFields, now: Millis = Date.now()): Promise<void> {
  // `schedule` is replaced whole, so fields of the previous kind (e.g. weekdays) do not linger.
  await db.habits.update(id, touch({ name: fields.name, schedule: fields.schedule, color: fields.color }, now));
}

export async function archiveHabit(id: Id, now: Millis = Date.now()): Promise<void> {
  await db.habits.update(id, touch({ archived: true }, now));
}

/**
 * Flips the mark of a habit on a day. Keeps one `HabitLog` per habit and day (`[habitId+date]`):
 * the first tap creates it with `done: true`, later taps flip `done`.
 */
export async function toggleHabit(habitId: Id, date: DateKey, now: Millis = Date.now()): Promise<boolean> {
  return db.transaction('rw', db.habitLogs, async () => {
    const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).toArray();
    if (existing.length === 0) {
      await db.habitLogs.add(newRecord({ habitId, date, done: true }, now));
      return true;
    }
    // Same tie-break as doneDays (the later one wins), so the tap flips the mark that is shown.
    const latest = existing.reduce((a, b) => (b.updatedAt >= a.updatedAt ? b : a));
    const done = !latest.done;
    await db.habitLogs.update(latest.id, touch({ done }, now));
    // Older duplicates (e.g. from an import) would only confuse later readers.
    const stale = existing.filter((l) => l.id !== latest.id).map((l) => l.id);
    if (stale.length > 0) await db.habitLogs.bulkDelete(stale);
    return done;
  });
}

/** Creates several habits at once (all or none), keeping their order by `createdAt`. */
export async function createHabits(list: readonly HabitFields[], now: Millis = Date.now()): Promise<void> {
  await db.transaction('rw', db.habits, () =>
    db.habits.bulkAdd(list.map((fields, i) => newRecord({ ...fields, archived: false }, now + i))),
  );
}
