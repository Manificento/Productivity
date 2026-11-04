import { shiftDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { median } from './pvt';

export const HISTORY_DAYS = 14;

/** The fields of a saved test that the history needs. */
export interface TestPoint {
  date: DateKey;
  startedAt: number;
  medianRtMs: number;
}

export interface DayMedian {
  date: DateKey;
  /** Undefined on days without a test. */
  medianRtMs?: number;
}

/** One value per day for the last 14 days ending `today`; several tests a day → their median. */
export function dailyMedians(tests: TestPoint[], today: DateKey): DayMedian[] {
  return Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const date = shiftDateKey(today, i - (HISTORY_DAYS - 1));
    const values = tests.filter((x) => x.date === date).map((x) => x.medianRtMs);
    return values.length ? { date, medianRtMs: median(values) } : { date };
  });
}

export interface Comparison {
  latestMs: number;
  /** Mean median of all earlier results. */
  averageMs: number;
  /** latest − average; negative = faster than usual. */
  diffMs: number;
}

/** Latest result versus my average of the earlier ones. Needs ≥ 2 results. */
export function compareWithAverage(tests: TestPoint[]): Comparison | undefined {
  if (tests.length < 2) return undefined;
  const sorted = [...tests].sort((a, b) => a.startedAt - b.startedAt);
  const latest = sorted[sorted.length - 1].medianRtMs;
  const earlier = sorted.slice(0, -1);
  const averageMs = Math.round(earlier.reduce((sum, x) => sum + x.medianRtMs, 0) / earlier.length);
  return { latestMs: latest, averageMs, diffMs: latest - averageMs };
}
