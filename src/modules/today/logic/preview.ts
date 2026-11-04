import { computeDailyTargets } from '../../../core/adaptation/engine';
import type { Baseline, DailyTargets } from '../../../core/adaptation/types';
import { shiftDateKey } from '../../../core/dates';
import type { DateKey, LifeEvent } from '../../../core/types';

export type PreviewRow = Pick<
  DailyTargets,
  | 'date'
  | 'phase'
  | 'taskCapacityMin'
  | 'sleepHours'
  | 'maxWorkoutIntensity'
  | 'focusPomodoros'
  | 'habitsMode'
  | 'meditationKind'
  | 'mindTrainingMin'
  | 'deload'
>;

export const PREVIEW_DAYS = 10;

/**
 * The next days starting today, as they will be with `event` (possibly unsaved) next to the user's
 * other events — a more important event still drives the days it covers. Only the pure engine is used.
 */
export function previewDays(
  event: LifeEvent,
  others: LifeEvent[],
  baseline: Baseline,
  today: DateKey,
  days = PREVIEW_DAYS,
): PreviewRow[] {
  const events = [...others.filter((e) => e.id !== event.id), event];
  return Array.from({ length: days }, (_, i) => {
    const t = computeDailyTargets(shiftDateKey(today, i), { baseline, events });
    return {
      date: t.date,
      phase: t.phase,
      taskCapacityMin: t.taskCapacityMin,
      sleepHours: t.sleepHours,
      maxWorkoutIntensity: t.maxWorkoutIntensity,
      focusPomodoros: t.focusPomodoros,
      habitsMode: t.habitsMode,
      meditationKind: t.meditationKind,
      mindTrainingMin: t.mindTrainingMin,
      deload: t.deload,
    };
  });
}

/** Compact capacity for a narrow table: «6 ч», «3,5 ч», «45 мин». */
export function formatCapacity(min: number): string {
  if (min === 0) return '0';
  if (min < 60) return `${min} мин`;
  return `${(min / 60).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}
