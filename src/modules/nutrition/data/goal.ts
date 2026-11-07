import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import type { DateKey, MealLog } from '../../../core/types';
import type { NutritionGoal } from '../../../core/adaptation/types';
import {
  WINDOW_DAYS,
  estimateExpenditure,
  needsRefresh,
  type Estimate,
  type Profile,
  type StoredExpenditure,
} from '../logic/expenditure';
import { dayTotals } from '../logic/nutrition';

const GOAL_KEY = 'nutrition.goal';
const EXPENDITURE_KEY = 'nutrition.expenditure';
const PROFILE_KEY = 'nutrition.profile';

const goalSchema = z.object({ kind: z.enum(['lose', 'maintain', 'gain']), ratePct: z.number().finite().min(0).max(2) });
const profileSchema = z.object({
  heightCm: z.number().finite().positive(),
  birthYear: z.number().int(),
  sex: z.enum(['male', 'female']),
});
const expenditureSchema = z.object({
  kcal: z.number().finite().positive(),
  updatedAt: z.number().finite(),
  source: z.enum(['measured', 'starter']).optional(),
});

async function readSetting<T>(key: string, schema: z.ZodType<T>): Promise<T | undefined> {
  const parsed = schema.safeParse((await db.settings.get(key))?.value);
  return parsed.success ? parsed.data : undefined;
}

export function useGoal(): { goal?: NutritionGoal; profile?: Profile; expenditure?: StoredExpenditure } | undefined {
  return useLiveQuery(
    async () => ({
      goal: await readSetting(GOAL_KEY, goalSchema),
      profile: await readSetting(PROFILE_KEY, profileSchema),
      expenditure: await readSetting(EXPENDITURE_KEY, expenditureSchema),
    }),
    [],
  );
}

export async function saveGoal(goal: NutritionGoal): Promise<void> {
  await db.settings.put({ key: GOAL_KEY, value: goalSchema.parse(goal) });
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.settings.put({ key: PROFILE_KEY, value: profileSchema.parse(profile) });
}

/** Eaten kcal per diary day over the estimate window. */
async function loadIntake(today: DateKey): Promise<Map<DateKey, number>> {
  const from = shiftDateKey(today, -(WINDOW_DAYS - 1));
  const [meals, foods] = await Promise.all([
    db.mealLogs.where('date').between(from, today, true, true).toArray(),
    db.foods.toArray(),
  ]);
  const byId = new Map(foods.map((f) => [f.id, f]));
  const byDay = new Map<DateKey, MealLog[]>();
  for (const m of meals) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m]);
  return new Map([...byDay].map(([date, list]) => [date, dayTotals(list, byId).day.kcal]));
}

/**
 * Recomputes `nutrition.expenditure` when it is missing, a week old, or a starter that can now be measured.
 * Returns the estimate it wrote (or the current one when nothing was due).
 */
export async function refreshExpenditure(today: DateKey, now: number = Date.now()): Promise<Estimate | undefined> {
  const [stored, profile, weights, intakeByDay] = await Promise.all([
    readSetting(EXPENDITURE_KEY, expenditureSchema),
    readSetting(PROFILE_KEY, profileSchema),
    db.weightLogs
      .where('date')
      .between(shiftDateKey(today, -(WINDOW_DAYS - 1)), today, true, true)
      .toArray(),
    loadIntake(today),
  ]);
  const latest = await db.weightLogs.where('date').belowOrEqual(today).last();
  const year = Number(today.slice(0, 4));
  const fallback = profile && latest ? { profile, weightKg: latest.kg, year } : undefined;
  const input = { today, weights, intakeByDay };
  const estimate = estimateExpenditure(input, fallback);
  if (!estimate) return undefined;
  if (estimate.kind === 'incomplete') {
    // Thin diary: the targets stay as they are. Only a missing or starter value is (re)filled with the starter estimate.
    const { starterKcal } = estimate;
    const replaceable = !stored || stored.source === 'starter';
    if (starterKcal !== undefined && replaceable && stored?.kcal !== starterKcal) {
      await db.settings.put({ key: EXPENDITURE_KEY, value: { kcal: starterKcal, updatedAt: now, source: 'starter' } });
    }
    return estimate;
  }
  const canMeasure = estimate.kind === 'measured';
  // A starter estimate is cheap and deterministic: rewrite it whenever the profile or weight changed it.
  const starterChanged = estimate.kind === 'starter' && (stored?.source !== 'starter' || stored.kcal !== estimate.kcal);
  if (stored && !starterChanged && !needsRefresh(stored, now, canMeasure)) return estimate;
  await db.settings.put({
    key: EXPENDITURE_KEY,
    value: { kcal: estimate.kcal, updatedAt: now, source: estimate.kind },
  });
  return estimate;
}

/** Changes whenever the inputs of the estimate change (latest weight, weigh-in and diary counts in the window). */
export function useEstimateInputs(today: DateKey): string | undefined {
  return useLiveQuery(async () => {
    const from = shiftDateKey(today, -(WINDOW_DAYS - 1));
    const [latest, weightDays, mealCount] = await Promise.all([
      db.weightLogs.where('date').belowOrEqual(today).last(),
      db.weightLogs.where('date').between(from, today, true, true).count(),
      db.mealLogs.where('date').between(from, today, true, true).count(),
    ]);
    return `${latest?.date}:${latest?.kg}:${weightDays}:${mealCount}`;
  }, [today]);
}
