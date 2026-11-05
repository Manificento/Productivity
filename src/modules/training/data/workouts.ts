import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey, todayKey } from '../../../core/dates';
import { db } from '../../../core/db';
import type { DateKey, WorkoutLog } from '../../../core/types';

/**
 * Workouts are WRITTEN only through `saveWorkout()` from `src/core/logging/workout.ts` (ADR-0007):
 * the same path health's Health Connect / HealthKit import (M7) uses. This file only reads and deletes.
 */

/** How far back the history list goes. */
export const HISTORY_DAYS = 60;

/**
 * Deletes a journal entry. A planned session that pointed at it is reopened (`planned` today or later,
 * `skipped` for a past day), so «выполнена» never stays without a journal entry behind it.
 */
export async function deleteWorkout(id: string, today: DateKey = todayKey()): Promise<void> {
  await db.transaction('rw', db.workoutLogs, db.plannedSessions, async () => {
    await db.workoutLogs.delete(id);
    await db.plannedSessions
      .filter((s) => s.workoutLogId === id)
      .modify((s) => {
        s.status = s.date < today ? 'skipped' : 'planned';
        delete s.workoutLogId;
        s.updatedAt = Date.now();
      });
  });
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
