import { shiftDateKey } from '../../../core/dates';
import type { SleepInput } from '../../../core/logging/sleep';
import type { WorkoutInput } from '../../../core/logging/workout';
import type { DateKey, ImportedSleep, ImportedWorkout } from '../../../core/types';
import { DEFAULT_QUALITY } from './sleep';

/** How far back the import reads (#131). */
export const IMPORT_DAYS = 30;
/**
 * RPE of an imported workout: the store does not know how hard it felt, the journal needs 1–10. A middle value; the
 * user may change it — a re-import keeps what was entered in LifeOS.
 */
export const IMPORTED_RPE = 5;

export function importRange(today: DateKey): { from: DateKey; to: DateKey } {
  return { from: shiftDateKey(today, -(IMPORT_DAYS - 1)), to: today };
}

/** Main nights → `saveSleep` inputs (one record per day; naps are skipped), quality = the form's default. */
export function sleepInputs(nights: ImportedSleep[]): SleepInput[] {
  return nights
    .filter((n) => n.main)
    .map((n) => ({
      bedtime: n.bedtime,
      wakeTime: n.wakeTime,
      quality: DEFAULT_QUALITY,
      sourceId: n.sourceId,
      externalId: n.externalId,
    }));
}

/** Workouts → `saveWorkout` inputs: whole minutes within the journal's 1–1440, default RPE; under a minute is skipped. */
export function workoutInputs(workouts: ImportedWorkout[]): WorkoutInput[] {
  return workouts
    .map((w) => ({ w, durationMin: Math.min(1440, Math.round(w.durationMin)) }))
    .filter(({ durationMin }) => durationMin >= 1)
    .map(({ w, durationMin }) => ({
      date: w.date,
      type: w.type,
      durationMin,
      rpe: IMPORTED_RPE,
      sourceId: w.sourceId,
      externalId: w.externalId,
    }));
}
