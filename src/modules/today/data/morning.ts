import { useLiveQuery } from 'dexie-react-hooks';
import { ZodError } from 'zod';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import type { Baseline } from '../../../core/adaptation/types';
import { db } from '../../../core/db';
import { saveSleep } from '../../../core/logging/sleep';
import type { DateKey, SleepLog } from '../../../core/types';
import { withSkipped, readSkipped, type MorningSleepInput, type MorningStep } from '../logic/morning';

export const MORNING_SETTING_KEY = 'adaptation.morning';

export interface MorningData {
  /** Sleep for the night that ended today. */
  sleep?: SleepLog;
  /** The latest logged night, for the one-tap suggestion. */
  lastSleep?: SleepLog;
  baselineBedtime: string;
  done: Record<MorningStep, boolean>;
  skipped: MorningStep[];
}

export async function loadMorning(today: DateKey): Promise<MorningData> {
  const [sleep, lastSleep, checkIn, tests, skips, baseline] = await Promise.all([
    db.sleepLogs.where('date').equals(today).first(),
    db.sleepLogs.orderBy('date').last(),
    db.checkIns.where('date').equals(today).first(),
    db.cognitiveTests.where('[kind+date]').equals(['pvt', today]).count(),
    db.settings.get(MORNING_SETTING_KEY),
    db.settings.get(BASELINE_SETTING_KEY),
  ]);
  return {
    sleep,
    lastSleep,
    baselineBedtime: { ...DEFAULT_BASELINE, ...((baseline?.value as Partial<Baseline>) ?? {}) }.bedtime,
    done: { sleep: sleep !== undefined, checkIn: checkIn !== undefined, test: tests > 0 },
    skipped: readSkipped(skips?.value, today),
  };
}

export function useMorning(today: DateKey): MorningData | undefined {
  return useLiveQuery(() => loadMorning(today), [today]);
}

/** Saves the night through the shared write path (`saveSleep`); validation errors come back as text. */
export async function saveMorningSleep(input: MorningSleepInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await saveSleep(input);
    return { ok: true };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0].message };
    throw e;
  }
}

export async function skipMorningStep(today: DateKey, step: MorningStep): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(MORNING_SETTING_KEY);
    await db.settings.put({ key: MORNING_SETTING_KEY, value: withSkipped(current?.value, today, step) });
  });
}
