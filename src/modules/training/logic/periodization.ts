import { DELOAD_FACTOR, LIGHT_DAY_RPE_LIMIT } from '../../../core/adaptation/rules';
import type { DailyTargets } from '../../../core/adaptation/types';
import type { ProgramExercise } from '../../../core/types';

// A deload day keeps `DELOAD_FACTOR` (60 %) of the volume and weight; on a light day an exercise with an RPE target
// of `LIGHT_DAY_RPE_LIMIT` or more is «сегодня легче». Both constants live in the core (`core/adaptation/rules.ts`).

type Targets = Pick<DailyTargets, 'deload' | 'maxWorkoutIntensity'>;

const roundHalf = (kg: number) => Math.round(kg * 2) / 2;

/** Sets and weights −40 %; at least one set stays. Repetitions are kept. */
export function deloadExercises(exercises: ProgramExercise[]): ProgramExercise[] {
  return exercises.map((e) => ({
    ...e,
    sets: Math.max(1, Math.round(e.sets * DELOAD_FACTOR)),
    ...(e.weightKg !== undefined && { weightKg: roundHalf(e.weightKg * DELOAD_FACTOR) }),
  }));
}

export interface AdjustedSession {
  exercises: ProgramExercise[];
  deload: boolean;
  /** The day's cap is «rest»: suggest moving the session. */
  rest: boolean;
  /** Per exercise: «сегодня легче» (RPE target too high for a light day). */
  easier: boolean[];
  /** The day's reasons from the engine, shown next to the note. */
  reasons: string[];
}

/** The planned session as it should be performed today, from the day's targets (adaptation only via targets). */
export function adjustForTargets(
  exercises: ProgramExercise[],
  targets: Targets & Pick<DailyTargets, 'reasons'>,
): AdjustedSession {
  const rest = targets.maxWorkoutIntensity === 'rest';
  // `rest` only gates the «suggest moving» step: if the user performs the session anyway, deload still applies.
  const deload = targets.deload;
  const light = targets.maxWorkoutIntensity === 'light' || rest;
  return {
    exercises: deload ? deloadExercises(exercises) : exercises,
    deload,
    rest,
    easier: exercises.map((e) => light && (e.rpeTarget ?? 0) >= LIGHT_DAY_RPE_LIMIT),
    reasons: targets.reasons,
  };
}

/** How a future day is marked in the plan. */
export function dayMark(targets: Targets): 'rest' | 'deload' | undefined {
  if (targets.maxWorkoutIntensity === 'rest') return 'rest';
  return targets.deload ? 'deload' : undefined;
}
