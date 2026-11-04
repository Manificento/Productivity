import { shiftDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';

/** Fewest paired days before any conclusion is shown. */
export const MIN_POINTS = 7;

/** Pearson correlation coefficient; undefined for < 2 points or a series without spread. */
export function pearson(xs: number[], ys: number[]): number | undefined {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return undefined;
  const mean = (a: number[]) => a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return undefined;
  return sxy / Math.sqrt(sxx * syy);
}

/** «Умеренная положительная связь» — usual rule-of-thumb thresholds 0.1 / 0.3 / 0.5. */
export function describeCorrelation(r: number): string {
  const a = Math.abs(r);
  if (a < 0.1) return 'Связи почти нет';
  const strength = a < 0.3 ? 'Слабая' : a < 0.5 ? 'Умеренная' : 'Сильная';
  return `${strength} ${r > 0 ? 'положительная' : 'отрицательная'} связь`;
}

/** Per-day values (DateKey → number) read from the other blocks. */
export interface InsightInput {
  /** Hours slept on the night that ended on the day. */
  sleep: Record<DateKey, number>;
  /** Tasks completed during the day. */
  tasksDone: Record<DateKey, number>;
  /** Minutes of finished Pomodoro sessions during the day. */
  focusMin: Record<DateKey, number>;
  /** Minutes of workouts during the day. */
  workoutMin: Record<DateKey, number>;
  /** Energy (1–5) at the morning check-in of the day. */
  energy: Record<DateKey, number>;
}

export interface InsightPoint {
  date: DateKey;
  x: number;
  y: number;
}

export interface Insight {
  id: 'sleep-tasks' | 'sleep-focus' | 'workout-energy';
  title: string;
  xLabel: string;
  yLabel: string;
  points: InsightPoint[];
  /** Pearson r; undefined while there is too little data or no spread. */
  r?: number;
  /** Days still needed before a conclusion (0 when there are enough). */
  missing: number;
}

function pairs(
  days: DateKey[],
  x: (d: DateKey) => number | undefined,
  y: (d: DateKey) => number | undefined,
): InsightPoint[] {
  return days.flatMap((date) => {
    const [a, b] = [x(date), y(date)];
    return a === undefined || b === undefined ? [] : [{ date, x: a, y: b }];
  });
}

function insight(base: Omit<Insight, 'r' | 'missing'>): Insight {
  const missing = Math.max(0, MIN_POINTS - base.points.length);
  return {
    ...base,
    missing,
    r:
      missing > 0
        ? undefined
        : pearson(
            base.points.map((p) => p.x),
            base.points.map((p) => p.y),
          ),
  };
}

/**
 * Three pairs. A sleep log marks a day as "tracked", so a tracked day without completed tasks or
 * focus sessions counts as zero; for workouts, a check-in on the next morning marks the pair.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const sleepDays = Object.keys(input.sleep).sort();
  const energyDays = Object.keys(input.energy).sort();
  return [
    insight({
      id: 'sleep-tasks',
      title: 'Сон ↔ выполненные задачи следующего дня',
      xLabel: 'Сон, ч',
      yLabel: 'Задачи',
      points: pairs(
        sleepDays,
        (d) => input.sleep[d],
        (d) => input.tasksDone[d] ?? 0,
      ),
    }),
    insight({
      id: 'sleep-focus',
      title: 'Сон ↔ фокус-минуты',
      xLabel: 'Сон, ч',
      yLabel: 'Фокус, мин',
      points: pairs(
        sleepDays,
        (d) => input.sleep[d],
        (d) => input.focusMin[d] ?? 0,
      ),
    }),
    insight({
      id: 'workout-energy',
      title: 'Тренировка ↔ энергия на следующее утро',
      xLabel: 'Тренировка, мин',
      yLabel: 'Энергия',
      // Day D's workout against the energy of D + 1, for every morning with a check-in.
      points: pairs(
        energyDays.map((d) => shiftDateKey(d, -1)),
        (d) => input.workoutMin[d] ?? 0,
        (d) => input.energy[shiftDateKey(d, 1)],
      ),
    }),
  ];
}
