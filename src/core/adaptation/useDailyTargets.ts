import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { z } from 'zod';
import { db } from '../db';
import { daysBetween, shiftDateKey } from '../dates';
import { sleepHours } from '../logging/sleepTime';
import type {
  CheckIn,
  CognitiveTest,
  DateKey,
  LifeEvent,
  MeditationSession,
  Setting,
  SleepLog,
  WeightLog,
  WorkoutLog,
} from '../types';
import { computeDailyTargets } from './engine';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from './rules';
import type { AdaptationContext, Baseline, DailyTargets, NutritionGoal } from './types';

export { sleepHours } from '../logging/sleepTime';

// `nutrition.*` settings are written by another module: validate, and treat anything odd as «no data».
const expenditureSchema = z.object({ kcal: z.number().finite().positive() });
const goalSchema = z.object({ kind: z.enum(['lose', 'maintain', 'gain']), ratePct: z.number().finite().min(0).max(2) });

/** The longest range `loadDailyTargetsRange` / `useDailyTargetsRange` accept, in days. */
export const MAX_RANGE_DAYS = 31;

/** Raw rows for every day of a range; `contextFor` picks one day's context out of them without touching the DB. */
interface RangeData {
  baselineSetting?: Setting;
  events: LifeEvent[];
  sleepLogs: SleepLog[];
  checkIns: CheckIn[];
  workouts: WorkoutLog[];
  expenditure?: Setting;
  goal?: Setting;
  /** The last weigh-in before the range, then those inside it, in index order (date, then id). */
  weights: WeightLog[];
  pvtRuns: CognitiveTest[];
  meditation: MeditationSession[];
}

const inRange = (day: DateKey, from: DateKey, to: DateKey) => day >= from && day <= to;

/** One read per table for the whole `from..to` range (the windows of `contextFor` for every day of it). */
async function loadRangeData(from: DateKey, to: DateKey): Promise<RangeData> {
  const [
    baselineSetting,
    events,
    sleepLogs,
    checkIns,
    workouts,
    expenditure,
    goal,
    weightBefore,
    weightsInRange,
    pvtRuns,
    meditation,
  ] = await Promise.all([
    db.settings.get(BASELINE_SETTING_KEY),
    // Events that can affect a day: from the day before up to ~60 days ahead.
    db.lifeEvents.where('date').between(shiftDateKey(from, -1), shiftDateKey(to, 60), true, true).toArray(),
    // The last three nights of each day (sleep counts for the morning you woke up).
    db.sleepLogs.where('date').between(shiftDateKey(from, -2), to, true, true).toArray(),
    db.checkIns.where('date').between(from, to, true, true).toArray(),
    // Yesterday's workouts of each day.
    db.workoutLogs.where('date').between(shiftDateKey(from, -1), shiftDateKey(to, -1), true, true).toArray(),
    // v2: written by the nutrition module; the core does not compute energy expenditure.
    db.settings.get('nutrition.expenditure'),
    db.settings.get('nutrition.goal'),
    db.weightLogs.where('date').below(from).last(),
    db.weightLogs.where('date').between(from, to, true, true).toArray(),
    db.cognitiveTests
      .where('[kind+date]')
      .between(['pvt', shiftDateKey(from, -13)], ['pvt', to], true, true)
      .toArray(),
    db.meditationSessions.where('date').between(shiftDateKey(from, -1), shiftDateKey(to, -1), true, true).toArray(),
  ]);
  return {
    baselineSetting,
    events,
    sleepLogs,
    checkIns,
    workouts,
    expenditure,
    goal,
    weights: weightBefore ? [weightBefore, ...weightsInRange] : weightsInRange,
    pvtRuns,
    meditation,
  };
}

/** What-if input for previews: an unsaved or edited event that replaces the stored one with the same id. */
export interface TargetsWhatIf {
  event?: LifeEvent;
}

/** The engine's context for `date`, picked from rows loaded for a range that covers it. Pure. */
function contextFor(date: DateKey, data: RangeData, whatIf: TargetsWhatIf = {}): AdaptationContext {
  const yesterday = shiftDateKey(date, -1);
  const stored = whatIf.event ? data.events.filter((e) => e.id !== whatIf.event!.id) : data.events;
  const events = (whatIf.event ? [...stored, whatIf.event] : stored).filter((e) =>
    inRange(e.date, yesterday, shiftDateKey(date, 60)),
  );
  const hoursOn = (day: DateKey) => {
    const log = data.sleepLogs.find((s) => s.date === day);
    return log ? sleepHours(log) : undefined;
  };
  const yesterdayWorkouts = data.workouts.filter((w) => w.date === yesterday);
  const weight = data.weights.findLast((w) => w.date <= date);
  const baseline: Baseline = { ...DEFAULT_BASELINE, ...((data.baselineSetting?.value as Partial<Baseline>) ?? {}) };
  const parsedExpenditure = expenditureSchema.safeParse(data.expenditure?.value);
  const parsedGoal = goalSchema.safeParse(data.goal?.value);
  // Valid runs of the 14-day window only (an imported backup may carry 0 or NaN), most recent first.
  const validPvt = data.pvtRuns
    .filter((run) => inRange(run.date, shiftDateKey(date, -13), date))
    .filter((run) => Number.isFinite(run.medianRtMs) && run.medianRtMs > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
  return {
    baseline,
    events,
    lastSleepHours: hoursOn(date),
    checkIn: data.checkIns.find((c) => c.date === date),
    recentSleepHours: [0, -1, -2].map((d) => hoursOn(shiftDateKey(date, d))),
    yesterdayMaxRpe: yesterdayWorkouts.length ? Math.max(...yesterdayWorkouts.map((w) => w.rpe)) : undefined,
    expenditureKcal: parsedExpenditure.success ? parsedExpenditure.data.kcal : undefined,
    nutritionGoal: parsedGoal.success ? (parsedGoal.data as NutritionGoal) : undefined,
    // The latest weight, however old: the nutrition module decides when to ask for a new one.
    weightKg: weight && Number.isFinite(weight.kg) && weight.kg > 0 ? weight.kg : undefined,
    recentPvtMediansMs: validPvt.map((run) => run.medianRtMs),
    // The latest run of the day: a retake replaces the earlier result.
    todayPvtMedianMs: validPvt.find((run) => run.date === date)?.medianRtMs,
    // `durationMin` is the time actually spent, so sessions stopped early count too.
    meditationMinYesterday: data.meditation
      .filter((m) => m.date === yesterday)
      .reduce((sum, m) => sum + m.durationMin, 0),
  };
}

/** Loads everything the engine needs for `date` from the local DB. */
export async function loadAdaptationContext(date: DateKey): Promise<AdaptationContext> {
  return contextFor(date, await loadRangeData(date, date));
}

/** Every day of `from..to` (inclusive); empty when `to` is before `from`. */
function rangeDays(from: DateKey, to: DateKey): DateKey[] {
  const count = daysBetween(from, to) + 1;
  if (count > MAX_RANGE_DAYS) throw new RangeError(`Targets range is limited to ${MAX_RANGE_DAYS} days`);
  return Array.from({ length: Math.max(0, count) }, (_, i) => shiftDateKey(from, i));
}

/**
 * Targets for every day of `from..to` (up to 31 days) from one set of DB reads — not a query per day.
 * `whatIf` previews an unsaved event without writing it.
 */
export async function loadDailyTargetsRange(
  from: DateKey,
  to: DateKey,
  whatIf?: TargetsWhatIf,
): Promise<DailyTargets[]> {
  const days = rangeDays(from, to);
  if (days.length === 0) return [];
  const data = await loadRangeData(from, to);
  return days.map((d) => computeDailyTargets(d, contextFor(d, data, whatIf)));
}

/** Targets for `date` from the local DB. */
export async function loadDailyTargets(date: DateKey): Promise<DailyTargets> {
  return computeDailyTargets(date, await loadAdaptationContext(date));
}

/** React hook: live daily targets, re-computed whenever the underlying data changes. */
export function useDailyTargets(date: DateKey): DailyTargets | undefined {
  return useLiveQuery(() => loadDailyTargets(date), [date]);
}

/**
 * React hook: live targets for every day of `from..to` (up to 31 days; a longer range throws) from ONE live
 * query. The rows are loaded once per range; a `whatIf` change (a form being edited) is recomputed at once,
 * without a new query. While a new range is loading the result is `undefined`, never targets from old rows.
 */
export function useDailyTargetsRange(from: DateKey, to: DateKey, whatIf?: TargetsWhatIf): DailyTargets[] | undefined {
  const days = useMemo(() => rangeDays(from, to), [from, to]);
  const loaded = useLiveQuery(
    async () => ({ from, to, data: days.length ? await loadRangeData(from, to) : undefined }),
    [from, to, days.length],
  );
  const event = whatIf?.event;
  return useMemo(() => {
    // dexie-react-hooks keeps the previous result while it re-subscribes: rows of another range do not count.
    if (!loaded || loaded.from !== from || loaded.to !== to) return undefined;
    const data = loaded.data;
    return data ? days.map((d) => computeDailyTargets(d, contextFor(d, data, { event }))) : [];
  }, [loaded, from, to, days, event]);
}
