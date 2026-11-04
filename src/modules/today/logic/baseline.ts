import { z } from 'zod';
import type { Baseline } from '../../../core/adaptation/types';
import type { WorkoutIntensity } from '../../../core/types';

export const INTENSITY_LABEL: Record<WorkoutIntensity, string> = {
  rest: 'отдых',
  light: 'лёгкая',
  moderate: 'умеренная',
  hard: 'любая',
};

/** Raw form values: number inputs hold strings. */
export interface BaselineFormValues {
  taskCapacityMin: string;
  sleepHours: string;
  bedtime: string;
  maxWorkoutIntensity: WorkoutIntensity;
  focusPomodoros: string;
  meditationMin: string;
  caffeineCutoff: string;
}

export function baselineToForm(b: Baseline): BaselineFormValues {
  return {
    taskCapacityMin: String(b.taskCapacityMin),
    sleepHours: String(b.sleepHours),
    bedtime: b.bedtime,
    maxWorkoutIntensity: b.maxWorkoutIntensity,
    focusPomodoros: String(b.focusPomodoros),
    meditationMin: String(b.meditationMin),
    caffeineCutoff: b.caffeineCutoff,
  };
}

/** Number from an input string; '' becomes NaN so it fails validation instead of turning into 0. */
const num = (message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.replace(',', '.'))) : v),
    z.number({ error: message }),
  );

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Укажите время');

const schema = z.object({
  taskCapacityMin: num('От 1 до 960 минут').pipe(
    z.number().int('От 1 до 960 минут').min(1, 'От 1 до 960 минут').max(960, 'От 1 до 960 минут'),
  ),
  sleepHours: num('От 4 до 12 часов').pipe(
    z.number().min(4, 'От 4 до 12 часов').max(12, 'От 4 до 12 часов').multipleOf(0.5, 'Шаг — полчаса'),
  ),
  bedtime: time,
  maxWorkoutIntensity: z.enum(['rest', 'light', 'moderate', 'hard']),
  focusPomodoros: num('Целое число от 0 до 16').pipe(
    z.number().int('Целое число от 0 до 16').min(0, 'Целое число от 0 до 16').max(16, 'Целое число от 0 до 16'),
  ),
  meditationMin: num('От 0 до 120 минут').pipe(
    z.number().int('От 0 до 120 минут').min(0, 'От 0 до 120 минут').max(120, 'От 0 до 120 минут'),
  ),
  caffeineCutoff: time,
});

export type BaselineFormErrors = Partial<Record<keyof BaselineFormValues, string>>;

export function parseBaseline(
  values: BaselineFormValues,
): { ok: true; data: Baseline } | { ok: false; errors: BaselineFormErrors } {
  const r = schema.safeParse(values);
  if (r.success) return { ok: true, data: r.data };
  const errors: BaselineFormErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path[0] as keyof BaselineFormValues;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
