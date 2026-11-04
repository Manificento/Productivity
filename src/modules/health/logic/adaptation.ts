import type { DailyTargets } from '../../../core/adaptation/types';
import type { WorkoutIntensity } from '../../../core/types';

/** Highest RPE that still fits an intensity cap. */
const MAX_RPE: Record<WorkoutIntensity, number> = { rest: 0, light: 4, moderate: 6, hard: 10 };

const INTENSITY_LABEL: Record<WorkoutIntensity, string> = {
  rest: 'отдых',
  light: 'лёгкая',
  moderate: 'умеренная',
  hard: 'высокая',
};

export function maxRpe(intensity: WorkoutIntensity): number {
  return MAX_RPE[intensity];
}

/** '−1,5 ч' / '+0,5 ч' / '0 ч' — signed, one decimal, Russian comma, typographic minus. */
export function formatHoursDiff(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  if (rounded === 0) return '0 ч';
  const abs = Math.abs(rounded).toString().replace('.', ',');
  return `${rounded < 0 ? '−' : '+'}${abs} ч`;
}

export interface IntensityWarning {
  limit: number;
  label: string;
  reasons: string[];
}

/**
 * Soft warning when the chosen RPE is above what today's targets allow, explained with the
 * day's reasons (all of them: the engine's wording is not a contract, so we don't filter it).
 */
export function intensityWarning(
  rpe: number | undefined,
  targets: Pick<DailyTargets, 'maxWorkoutIntensity' | 'reasons'>,
): IntensityWarning | undefined {
  const limit = maxRpe(targets.maxWorkoutIntensity);
  if (rpe === undefined || rpe <= limit) return undefined;
  const reasons = targets.reasons.length > 0 ? targets.reasons : ['Так задано в вашем обычном режиме'];
  return { limit, label: INTENSITY_LABEL[targets.maxWorkoutIntensity], reasons };
}
