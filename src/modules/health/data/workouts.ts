import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import type { DateKey, WorkoutLog } from '../../../core/types';
import type { WorkoutInput } from '../logic/workouts';

/** How far back the history list goes. */
export const HISTORY_DAYS = 60;

export async function saveWorkout(input: WorkoutInput, now: number = Date.now()): Promise<WorkoutLog> {
  const record: WorkoutLog = newRecord(input, now);
  await db.workoutLogs.add(record);
  return record;
}

/**
 * Workouts of the last 60 days (this covers the current week too), newest first
 * (same day: latest saved first).
 */
export async function loadRecentWorkouts(today: DateKey): Promise<WorkoutLog[]> {
  const from = shiftDateKey(today, -(HISTORY_DAYS - 1));
  const logs = await db.workoutLogs.where('date').aboveOrEqual(from).toArray();
  return logs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function useRecentWorkouts(today: DateKey): WorkoutLog[] | undefined {
  return useLiveQuery(() => loadRecentWorkouts(today), [today]);
}
