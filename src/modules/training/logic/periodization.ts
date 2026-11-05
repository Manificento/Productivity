import type { DailyTargets } from '../../../core/adaptation/types';
import type { ProgramExercise } from '../../../core/types';

/**
 * A deload day keeps 60 % of the planned volume and weight (−40 %, as in the engine's reason text, `core/adaptation/rules.ts`).
 * TODO(core): export the factor and the light-day RPE limit from the core to avoid drift.
 */
export const DELOAD_FACTOR = 0.6;

/** RPE target from which an exercise is «сегодня легче» on a light day. */
export const HARD_RPE = 7;

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
    easier: exercises.map((e) => light && (e.rpeTarget ?? 0) >= HARD_RPE),
    reasons: targets.reasons,
  };
}

/** How a future day is marked in the plan. */
export function dayMark(targets: Targets): 'rest' | 'deload' | undefined {
  if (targets.maxWorkoutIntensity === 'rest') return 'rest';
  return targets.deload ? 'deload' : undefined;
}
