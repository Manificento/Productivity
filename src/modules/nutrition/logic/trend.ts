import { daysBetween } from '../../../core/dates';
import type { DateKey } from '../../../core/types';

/** From how many entries the chart draws a trend line. */
export const TREND_MIN_ENTRIES = 14;
/** Plausible human body weight, kg. */
export const MIN_KG = 20;
export const MAX_KG = 300;
/** Smoothing factor: the new trend is 10 % today's weight, 90 % the old trend. */
const ALPHA = 0.1;

export interface WeightPoint {
  date: DateKey;
  kg: number;
}

export interface TrendPoint extends WeightPoint {
  trend: number;
}

/** «72,4» / «72.4» → 72.4; anything else → undefined. */
export function parseKg(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

/** Error text for a weight outside [MIN_KG, MAX_KG], or undefined if fine. */
export function validateKg(kg: number | undefined): string | undefined {
  if (kg === undefined || !Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG) {
    return `Вес — число от ${MIN_KG} до ${MAX_KG} кг`;
  }
  return undefined;
}

export function formatKg(kg: number): string {
  return String(Math.round(kg * 10) / 10).replace('.', ',');
}

/** Exponentially smoothed weight per entry, sorted by date. */
export function trendSeries(entries: WeightPoint[]): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let trend = 0;
  return sorted.map((e, i) => {
    trend = i === 0 ? e.kg : trend + ALPHA * (e.kg - trend);
    return { ...e, trend };
  });
}

/** Oldest allowed distance to the reference entry; with a longer gap the «week» would describe something else. */
const MAX_GAP_DAYS = 14;

/**
 * Trend change per 7 days: from the last entry at least 7 days older than the newest one,
 * scaled to a week when that entry is older. Undefined without such an entry or after a gap over 14 days.
 */
export function weeklyChange(series: TrendPoint[]): number | undefined {
  const last = series.at(-1);
  if (!last) return undefined;
  const past = series.findLast((p) => daysBetween(p.date, last.date) >= 7);
  if (!past) return undefined;
  const days = daysBetween(past.date, last.date);
  if (days > MAX_GAP_DAYS) return undefined;
  return ((last.trend - past.trend) / days) * 7;
}
