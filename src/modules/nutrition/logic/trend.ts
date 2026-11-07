import { daysBetween, shiftDateKey } from '../../../core/dates';
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

/** The chart shows this many last calendar days unless the whole history is asked for. */
export const CHART_DAYS = 90;
/** The trend line breaks where two entries are further apart than this many days. */
export const MAX_LINE_GAP_DAYS = 3;

/**
 * Exponentially smoothed weight per entry, sorted by date. The smoothing decays per calendar day:
 * after a gap of n days the old trend keeps (1 − α)^n of its weight, as if each missing day were lost.
 */
export function trendSeries(entries: WeightPoint[]): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let trend = 0;
  return sorted.map((e, i) => {
    if (i === 0) trend = e.kg;
    else {
      const gap = Math.max(1, daysBetween(sorted[i - 1]!.date, e.date));
      trend += (1 - (1 - ALPHA) ** gap) * (e.kg - trend);
    }
    return { ...e, trend };
  });
}

/** Entries of the last `days` calendar days up to and including `today`. */
export function lastDays(series: TrendPoint[], today: DateKey, days: number = CHART_DAYS): TrendPoint[] {
  const from = shiftDateKey(today, -(days - 1));
  return series.filter((p) => p.date >= from);
}

/** Consecutive runs of the series without a gap longer than MAX_LINE_GAP_DAYS; each is drawn as its own line. */
export function trendSegments(series: TrendPoint[]): TrendPoint[][] {
  const segments: TrendPoint[][] = [];
  for (const p of series) {
    const current = segments.at(-1);
    const prev = current?.at(-1);
    if (current && prev && daysBetween(prev.date, p.date) <= MAX_LINE_GAP_DAYS) current.push(p);
    else segments.push([p]);
  }
  return segments;
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
