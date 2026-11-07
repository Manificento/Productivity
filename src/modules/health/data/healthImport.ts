import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { db } from '../../../core/db';
import { saveSleep } from '../../../core/logging/sleep';
import { saveWorkout } from '../../../core/logging/workout';
import { readSleep, readWorkouts, requestHealthAccess } from '../../../core/platform';
import type { DateKey, Millis } from '../../../core/types';
import { importRange, sleepInputs, workoutInputs } from '../logic/healthImport';

/**
 * Import of sleep and workouts from Health Connect / HealthKit (#131) through `platform.ts`; nights go through
 * `saveSleep`, workouts through `saveWorkout`, both with `sourceId` + `externalId` (no duplicates on re-import, a
 * night already logged for the day is kept). Settings key of this module: `health.import` — on/off, last run.
 */
const KEY = 'health.import';
const State = z.object({ enabled: z.boolean(), lastRunAt: z.number().optional() });
export type HealthImportState = z.infer<typeof State>;

/** Re-import when the app comes back after this long (the night appears in the store in the morning). */
export const REIMPORT_AFTER_MS = 3_600_000;

export type HealthImportOutcome =
  | { status: 'ok'; nights: number; workouts: number; hint?: string }
  | { status: 'denied' | 'unsupported' | 'failed'; hint: string };

export async function loadHealthImport(): Promise<HealthImportState> {
  const parsed = State.safeParse((await db.settings.get(KEY))?.value);
  return parsed.success ? parsed.data : { enabled: false };
}

export function useHealthImport(): HealthImportState | undefined {
  return useLiveQuery(loadHealthImport, []);
}

/** Reads the last 30 days and saves them. A night or workout the journal rejects is skipped, the rest is saved. */
export async function runHealthImport(today: DateKey, now: Millis = Date.now()): Promise<HealthImportOutcome> {
  const { from, to } = importRange(today);
  const [sleep, workouts] = await Promise.all([readSleep(from, to), readWorkouts(from, to)]);
  if (sleep.status !== 'ok' && workouts.status !== 'ok') return sleep;
  let nights = 0;
  if (sleep.status === 'ok') {
    for (const input of sleepInputs(sleep.items)) {
      try {
        await saveSleep(input, now);
        nights++;
      } catch (e) {
        console.error('import: night skipped', e);
      }
    }
  }
  let saved = 0;
  if (workouts.status === 'ok') {
    for (const input of workoutInputs(workouts.items)) {
      try {
        await saveWorkout(input, now);
        saved++;
      } catch (e) {
        console.error('import: workout skipped', e);
      }
    }
  }
  const state = await loadHealthImport();
  await db.settings.put({ key: KEY, value: { ...state, lastRunAt: now } });
  const hint =
    (sleep.status !== 'ok' ? sleep.hint : undefined) ??
    (workouts.status !== 'ok' ? workouts.hint : undefined) ??
    sleep.hint ??
    workouts.hint;
  return { status: 'ok', nights, workouts: saved, ...(hint && { hint }) };
}

/** «Подключить»: the system access sheet (call from a tap), then the first import. Refused — stays off, says why. */
export async function connectHealthImport(today: DateKey, now: Millis = Date.now()): Promise<HealthImportOutcome> {
  const access = await requestHealthAccess();
  if (access.status !== 'granted') return access;
  await db.settings.put({ key: KEY, value: { enabled: true } });
  return runHealthImport(today, now);
}

export async function disconnectHealthImport(): Promise<void> {
  await db.settings.put({ key: KEY, value: { enabled: false } });
}

/** On app start and when it comes back: import if on and the last run is over an hour ago. Never rejects. */
export async function importIfDue(today: DateKey, now: Millis = Date.now()): Promise<void> {
  const state = await loadHealthImport();
  if (!state.enabled || (state.lastRunAt !== undefined && now - state.lastRunAt < REIMPORT_AFTER_MS)) return;
  try {
    const result = await runHealthImport(today, now);
    if (result.status !== 'ok') console.error('health import', result);
  } catch (e) {
    console.error('health import failed', e);
  }
}
