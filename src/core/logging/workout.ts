import { z } from 'zod';
import { db } from '../db';
import { newRecord } from '../ids';
import type { WorkoutLog } from '../types';

/**
 * The ONE write path for workout records (contract C3, ADR-0007).
 * Owner of `workoutLogs` is the training block (health until the journal moves there); `health` keeps
 * writing workouts imported from Health Connect / HealthKit. Both go through this function, so the
 * validation of a workout lives in a single place and no module writes `workoutLogs` directly.
 */
const Set = z.object({
  reps: z.number().int().min(0).optional(),
  weightKg: z.number().min(0).optional(),
});

const Exercise = z.object({
  name: z.string().trim().min(1, 'Укажите название упражнения'),
  sets: z.array(Set),
});

export const WorkoutInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть днём в формате ГГГГ-ММ-ДД'),
  type: z.string().trim().min(1, 'Выберите тип тренировки'),
  durationMin: z
    .number()
    .int('Длительность — целое число минут')
    .min(1, 'Укажите длительность в минутах')
    .max(1_440, 'Длительность — не больше 1440 минут'),
  rpe: z.number().int('RPE — от 1 до 10').min(1, 'RPE — от 1 до 10').max(10, 'RPE — от 1 до 10'),
  exercises: z.array(Exercise).optional(),
  note: z.string().optional(),
});

export type WorkoutInput = z.infer<typeof WorkoutInput>;

/** Validates and appends one workout. Several workouts per day are allowed. */
export async function saveWorkout(input: WorkoutInput, now: number = Date.now()): Promise<WorkoutLog> {
  const valid = WorkoutInput.parse(input);
  const record: WorkoutLog = newRecord(valid, now);
  await db.workoutLogs.add(record);
  return record;
}
