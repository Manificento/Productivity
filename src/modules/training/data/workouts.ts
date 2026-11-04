import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import type { DateKey, WorkoutLog } from '../../../core/types';

/**
 * Workouts are WRITTEN only through `saveWorkout()` from `src/core/logging/workout.ts` (ADR-0007):
 * the same path health's Health Connect / HealthKit import (M7) uses. This file only reads and deletes.
 */

/** How far back the history list goes. */
export const HISTORY_DAYS = 60;

export async function deleteWorkout(id: string): Promise<void> {
  await db.workoutLogs.delete(id);
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
