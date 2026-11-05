import { daysBetween, shiftDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import type { WeightPoint } from './trend';

/** The estimate looks at this many days up to and including today. */
export const WINDOW_DAYS = 28;
export const MIN_WEIGHT_DAYS = 14;
export const MIN_FOOD_DAYS = 10;
/** Energy equivalent of 1 kg of body mass (same as the adaptation engine). */
export const KCAL_PER_KG = 7700;
/** Light everyday activity multiplier for the starter estimate. */
const ACTIVITY_FACTOR = 1.4;
const REFRESH_MS = 7 * 24 * 3600 * 1000;
/** Estimates outside this range are noise (e.g. a diary with only snacks logged), not an expenditure. */
const SANE_KCAL = { min: 1000, max: 6000 };

export interface Profile {
  heightCm: number;
  birthYear: number;
  sex: 'male' | 'female';
}

export interface EstimateInput {
  today: DateKey;
  weights: WeightPoint[];
  /** Eaten kcal per diary day; days without entries are absent. */
  intakeByDay: Map<DateKey, number>;
}

export type Estimate =
  | { kind: 'measured'; kcal: number }
  | { kind: 'starter'; kcal: number; /** Days of logging still needed for a measured estimate. */ daysLeft: number };

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Mifflin–St Jeor basal rate × light activity, rounded to 10 kcal. */
export function starterExpenditure(profile: Profile, weightKg: number, year: number): number {
  const age = year - profile.birthYear;
  const bmr = 10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.sex === 'male' ? 5 : -161);
  return round10(bmr * ACTIVITY_FACTOR);
}

/** Least-squares slope, kg per day, over weigh-ins on uneven days. */
function weightSlope(weights: WeightPoint[]): number {
  const first = weights[0]!.date;
  const xs = weights.map((w) => daysBetween(first, w.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = weights.reduce((a, w) => a + w.kg, 0) / weights.length;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (weights[i]!.kg - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

/**
 * Expenditure = average intake over the diary days + energy equivalent of the weight trend
 * (losing weight means you ate less than you spent). Needs ≥ 14 weigh-ins and ≥ 10 diary days
 * in the last 28 days; otherwise falls back to the starter estimate, if the profile and a weight are known.
 */
export function estimateExpenditure(
  input: EstimateInput,
  fallback?: { profile: Profile; weightKg: number; year: number },
): Estimate | undefined {
  const from = shiftDateKey(input.today, -(WINDOW_DAYS - 1));
  const weights = input.weights
    .filter((w) => w.date >= from && w.date <= input.today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const intakes = [...input.intakeByDay].filter(([d, kcal]) => d >= from && d <= input.today && kcal > 0);

  if (weights.length >= MIN_WEIGHT_DAYS && intakes.length >= MIN_FOOD_DAYS) {
    const avg = intakes.reduce((a, [, kcal]) => a + kcal, 0) / intakes.length;
    const kcal = round10(avg - weightSlope(weights) * KCAL_PER_KG);
    if (kcal >= SANE_KCAL.min && kcal <= SANE_KCAL.max) return { kind: 'measured', kcal };
  }
  if (!fallback) return undefined;
  const daysLeft = Math.max(1, MIN_WEIGHT_DAYS - weights.length, MIN_FOOD_DAYS - intakes.length);
  return { kind: 'starter', kcal: starterExpenditure(fallback.profile, fallback.weightKg, fallback.year), daysLeft };
}

/** Stored `nutrition.expenditure`. */
export interface StoredExpenditure {
  kcal: number;
  updatedAt: number;
  source?: 'measured' | 'starter';
}

/** Weekly recompute; a starter estimate is replaced as soon as enough data is there. */
export function needsRefresh(stored: StoredExpenditure | undefined, now: number, canMeasure = false): boolean {
  if (!stored) return true;
  if (stored.source === 'starter' && canMeasure) return true;
  return now - stored.updatedAt >= REFRESH_MS;
}

export interface ProfileDraft {
  heightCm: string;
  birthYear: string;
  sex: Profile['sex'];
}

export function parseProfile(
  d: ProfileDraft,
  year: number,
): { ok: true; value: Profile } | { ok: false; error: string } {
  const heightCm = Number(d.heightCm.trim().replace(',', '.'));
  const birthYear = Number(d.birthYear.trim());
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250)
    return { ok: false, error: 'Рост — от 100 до 250 см' };
  if (!Number.isInteger(birthYear) || birthYear < year - 100 || birthYear > year - 10) {
    return { ok: false, error: 'Укажите год рождения' };
  }
  return { ok: true, value: { heightCm, birthYear, sex: d.sex } };
}

/** Allowed weekly rates, % of body weight (SPEC 5.6: usually 0.25–1). */
export const RATE_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
