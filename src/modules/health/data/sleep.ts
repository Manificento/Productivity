import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { saveSleep } from '../../../core/logging/sleep';
import { sleepWindow } from '../../../core/logging/sleepTime';
import type { DateKey, SleepLog } from '../../../core/types';
import { CHART_DAYS } from '../logic/sleep';

export interface SleepEntry {
  /** The wake-up day. */
  wakeDay: DateKey;
  bedtime: string;
  wake: string;
  quality: number;
}

/**
 * Saves a night through the shared write path (`sleepWindow` + `saveSleep`, ADR-0007).
 * Returns a Russian error message instead of throwing when the input is invalid.
 */
export async function logSleep(
  entry: SleepEntry,
  today: DateKey,
): Promise<{ ok: true; log: SleepLog } | { ok: false; error: string }> {
  if (!entry.wakeDay) return { ok: false, error: 'Укажите день подъёма' };
  if (entry.wakeDay > today) return { ok: false, error: 'День подъёма не может быть позже сегодняшнего' };
  if (!entry.bedtime || !entry.wake) return { ok: false, error: 'Укажите время отбоя и подъёма' };
  try {
    const span = sleepWindow(entry.wakeDay, entry.bedtime, entry.wake);
    return { ok: true, log: await saveSleep({ ...span, quality: entry.quality }) };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'Проверьте время' };
    return { ok: false, error: 'Не удалось сохранить сон — попробуйте ещё раз' };
  }
}

/** Sleep records of the 14 days ending `today`. */
export function loadRecentSleep(today: DateKey): Promise<SleepLog[]> {
  return db.sleepLogs
    .where('date')
    .between(shiftDateKey(today, -(CHART_DAYS - 1)), today, true, true)
    .toArray();
}

export function useRecentSleep(today: DateKey): SleepLog[] | undefined {
  return useLiveQuery(() => loadRecentSleep(today), [today]);
}
