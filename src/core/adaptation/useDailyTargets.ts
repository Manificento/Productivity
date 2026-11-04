import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { shiftDateKey } from '../dates';
import type { DateKey } from '../types';
import { computeDailyTargets } from './engine';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from './rules';
import type { Baseline, DailyTargets } from './types';

export function sleepHours(log: { bedtime: number; wakeTime: number }): number {
  return (log.wakeTime - log.bedtime) / 3_600_000;
}

/** Loads everything the engine needs for `date` from the local DB. */
export async function loadDailyTargets(date: DateKey): Promise<DailyTargets> {
  const [baselineSetting, events, sleep, checkIn] = await Promise.all([
    db.settings.get(BASELINE_SETTING_KEY),
    // Events that can affect `date`: from yesterday up to ~60 days ahead.
    db.lifeEvents.where('date').between(shiftDateKey(date, -1), shiftDateKey(date, 60), true, true).toArray(),
    db.sleepLogs.where('date').equals(date).first(),
    db.checkIns.where('date').equals(date).first(),
  ]);
  const baseline: Baseline = { ...DEFAULT_BASELINE, ...((baselineSetting?.value as Partial<Baseline>) ?? {}) };
  return computeDailyTargets(date, {
    baseline,
    events,
    lastSleepHours: sleep ? sleepHours(sleep) : undefined,
    checkIn,
  });
}

/** React hook: live daily targets, re-computed whenever the underlying data changes. */
export function useDailyTargets(date: DateKey): DailyTargets | undefined {
  return useLiveQuery(() => loadDailyTargets(date), [date]);
}
