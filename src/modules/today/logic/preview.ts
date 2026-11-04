import { computeDailyTargets } from '../../../core/adaptation/engine';
import type { Baseline, DailyTargets } from '../../../core/adaptation/types';
import { shiftDateKey } from '../../../core/dates';
import type { DateKey, LifeEvent } from '../../../core/types';

export type PreviewRow = Pick<
  DailyTargets,
  'date' | 'phase' | 'taskCapacityMin' | 'sleepHours' | 'maxWorkoutIntensity' | 'focusPomodoros'
>;

export const PREVIEW_DAYS = 10;

/**
 * How one event reshapes the next days, starting today. Only the pure engine is used,
 * so it works for an unsaved form as well as for a stored event.
 */
export function previewDays(event: LifeEvent, baseline: Baseline, today: DateKey, days = PREVIEW_DAYS): PreviewRow[] {
  return Array.from({ length: days }, (_, i) => {
    const t = computeDailyTargets(shiftDateKey(today, i), { baseline, events: [event] });
    return {
      date: t.date,
      phase: t.phase,
      taskCapacityMin: t.taskCapacityMin,
      sleepHours: t.sleepHours,
      maxWorkoutIntensity: t.maxWorkoutIntensity,
      focusPomodoros: t.focusPomodoros,
    };
  });
}

/** Compact capacity for a narrow table: «6 ч», «3,5 ч», «45 мин». */
export function formatCapacity(min: number): string {
  if (min === 0) return '0';
  if (min < 60) return `${min} мин`;
  return `${(min / 60).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}
