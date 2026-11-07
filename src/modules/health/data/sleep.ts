import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { saveSleep } from '../../../core/logging/sleep';
import { clearNightSamples, readNightSamples, stopNightSensing } from '../../../core/platform';
import { sleepStages } from '../../../core/sleepPhases';
import { sleepWindow } from '../../../core/logging/sleepTime';
import type { DateKey, NightSample, SleepLog } from '../../../core/types';
import { CHART_DAYS } from '../logic/sleep';

export interface SleepEntry {
  /** The wake-up day. */
  wakeDay: DateKey;
  bedtime: string;
  wake: string;
  quality: number;
  /** «Я встал» (#130): read the night-sensing buffer at save time, save the night with its stages, clear the buffer. */
  fromNightSensing?: boolean;
}

/** The night is saved: stop recording (never rejects), then clear what was read. Never rejects. */
async function finishNight(samples: NightSample[]): Promise<void> {
  await stopNightSensing();
  if (samples.length === 0) return;
  try {
    await clearNightSamples(Math.max(...samples.map((s) => s.minuteStart)));
  } catch (e) {
    console.error('clearNightSamples failed: the night is saved, the buffer stays', e);
  }
}

/** Stages of the night in the form, for the preview on «Я встал» (the same as saved). */
export function nightStages(entry: Pick<SleepEntry, 'wakeDay' | 'bedtime' | 'wake'>, samples: NightSample[]) {
  try {
    const span = sleepWindow(entry.wakeDay, entry.bedtime, entry.wake);
    return sleepStages(samples, span.bedtime, span.wakeTime);
  } catch {
    return [];
  }
}

/** The night-sensing buffer, or [] where it is unavailable or cannot be read. */
export async function loadNightSamples(): Promise<NightSample[]> {
  try {
    return await readNightSamples();
  } catch (e) {
    console.error('readNightSamples failed', e);
    return [];
  }
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
    const samples = entry.fromNightSensing ? await loadNightSamples() : [];
    const stages = sleepStages(samples, span.bedtime, span.wakeTime);
    const log = await saveSleep({ ...span, quality: entry.quality, ...(stages.length > 0 && { stages }) });
    if (entry.fromNightSensing) await finishNight(samples);
    return { ok: true, log };
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
