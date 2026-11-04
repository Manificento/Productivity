import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { shiftDateKey } from '../dates';
import { sleepHours } from '../logging/sleepTime';
import type { DateKey } from '../types';
import { computeDailyTargets } from './engine';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from './rules';
import type { AdaptationContext, Baseline, DailyTargets, NutritionGoal } from './types';

export { sleepHours } from '../logging/sleepTime';

/** Loads everything the engine needs for `date` from the local DB. */
export async function loadAdaptationContext(date: DateKey): Promise<AdaptationContext> {
  const yesterday = shiftDateKey(date, -1);
  const [
    baselineSetting,
    events,
    sleepLogs,
    checkIn,
    yesterdayWorkouts,
    expenditure,
    goal,
    weight,
    pvtRuns,
    yesterdayMeditation,
  ] = await Promise.all([
    db.settings.get(BASELINE_SETTING_KEY),
    // Events that can affect `date`: from yesterday up to ~60 days ahead.
    db.lifeEvents.where('date').between(yesterday, shiftDateKey(date, 60), true, true).toArray(),
    // The last three nights (sleep counts for the morning you woke up).
    db.sleepLogs.where('date').between(shiftDateKey(date, -2), date, true, true).toArray(),
    db.checkIns.where('date').equals(date).first(),
    db.workoutLogs.where('date').equals(yesterday).toArray(),
    // v2: written by the nutrition module; the core does not compute energy expenditure.
    db.settings.get('nutrition.expenditure'),
    db.settings.get('nutrition.goal'),
    db.weightLogs.where('date').belowOrEqual(date).last(),
    db.cognitiveTests
      .where('[kind+date]')
      .between(['pvt', shiftDateKey(date, -13)], ['pvt', date], true, true)
      .toArray(),
    db.meditationSessions.where('date').equals(yesterday).toArray(),
  ]);
  const hoursOn = (day: DateKey) => {
    const log = sleepLogs.find((s) => s.date === day);
    return log ? sleepHours(log) : undefined;
  };
  const baseline: Baseline = { ...DEFAULT_BASELINE, ...((baselineSetting?.value as Partial<Baseline>) ?? {}) };
  const expenditureKcal = (expenditure?.value as { kcal?: number } | undefined)?.kcal;
  const pvtMedians = pvtRuns
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)
    .map((run) => run.medianRtMs)
    .filter((m) => Number.isFinite(m));
  return {
    baseline,
    events,
    lastSleepHours: hoursOn(date),
    checkIn,
    recentSleepHours: [0, -1, -2].map((d) => hoursOn(shiftDateKey(date, d))),
    yesterdayMaxRpe: yesterdayWorkouts.length ? Math.max(...yesterdayWorkouts.map((w) => w.rpe)) : undefined,
    expenditureKcal: typeof expenditureKcal === 'number' ? expenditureKcal : undefined,
    nutritionGoal: goal?.value as NutritionGoal | undefined,
    weightKg: weight?.kg,
    recentPvtMediansMs: pvtMedians,
    meditationMinYesterday: yesterdayMeditation.reduce((sum, m) => sum + m.durationMin, 0),
  };
}

/** Targets for `date` from the local DB. */
export async function loadDailyTargets(date: DateKey): Promise<DailyTargets> {
  return computeDailyTargets(date, await loadAdaptationContext(date));
}

/** React hook: live daily targets, re-computed whenever the underlying data changes. */
export function useDailyTargets(date: DateKey): DailyTargets | undefined {
  return useLiveQuery(() => loadDailyTargets(date), [date]);
}
