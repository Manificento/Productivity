import { z } from 'zod';
import { db } from '../db';
import { newRecord } from '../ids';
import type { WorkoutLog } from '../types';
import { DateKeyField } from './fields';

/**
 * The ONE write path for workout records (contract C3, ADR-0007).
 * Owner of `workoutLogs` is the training block (health until the journal moves there); `health` keeps
 * writing workouts imported from Health Connect / HealthKit. Both go through this function, so the
 * validation of a workout lives in a single place and no module writes `workoutLogs` directly.
 */
const WorkoutSet = z.object({
  reps: z.number().int().min(0).optional(),
  weightKg: z.number().min(0).optional(),
});

const Exercise = z.object({
  name: z.string().trim().min(1, 'Укажите название упражнения'),
  sets: z.array(WorkoutSet),
});

const ImportKey = z.string().trim().min(1);

export const WorkoutInput = z
  .object({
    date: DateKeyField,
    type: z.string().trim().min(1, 'Выберите тип тренировки'),
    durationMin: z
      .number()
      .int('Длительность — целое число минут')
      .min(1, 'Укажите длительность в минутах')
      .max(1_440, 'Длительность — не больше 1440 минут'),
    rpe: z.number().int('RPE — от 1 до 10').min(1, 'RPE — от 1 до 10').max(10, 'RPE — от 1 до 10'),
    exercises: z.array(Exercise).optional(),
    note: z.string().optional(),
    /** Imported workouts only (`readWorkouts()` in `platform.ts`): the app that recorded it… */
    sourceId: ImportKey.optional(),
    /** …and its id in the health store. Both or neither. */
    externalId: ImportKey.optional(),
  })
  .refine((w) => (w.sourceId === undefined) === (w.externalId === undefined), {
    message: 'У импортированной тренировки нужны и источник, и внешний id',
    path: ['externalId'],
  });

export type WorkoutInput = z.infer<typeof WorkoutInput>;

/** Fields an import owns: a re-import overwrites them; RPE, exercises and the note entered in the app stay. */
const IMPORT_OWNED = ['date', 'type', 'durationMin'] as const;

/**
 * Validates and appends one workout. Several workouts per day are allowed. «Не в будущем» is a rule of the
 * entry form (`parseDraft` knows the user's today), not of the table: imports may carry any past day.
 * An imported workout (`sourceId` + `externalId`) already saved is updated instead: no duplicate on re-import.
 */
export async function saveWorkout(input: WorkoutInput, now: number = Date.now()): Promise<WorkoutLog> {
  const valid = WorkoutInput.parse(input);
  const { sourceId, externalId } = valid;
  if (sourceId === undefined || externalId === undefined) {
    const record: WorkoutLog = newRecord(valid, now);
    await db.workoutLogs.add(record);
    return record;
  }
  return db.transaction('rw', db.workoutLogs, async () => {
    const existing = await db.workoutLogs.where('[sourceId+externalId]').equals([sourceId, externalId]).first();
    if (!existing) {
      const record: WorkoutLog = newRecord(valid, now);
      await db.workoutLogs.add(record);
      return record;
    }
    const updated: WorkoutLog = { ...existing, updatedAt: now };
    for (const key of IMPORT_OWNED) Object.assign(updated, { [key]: valid[key] });
    await db.workoutLogs.put(updated);
    return updated;
  });
}
