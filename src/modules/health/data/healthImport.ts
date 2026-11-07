import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { db } from '../../../core/db';
import { deleteSleep, saveSleep } from '../../../core/logging/sleep';
import { saveWorkout } from '../../../core/logging/workout';
import { readSleep, readWorkouts, requestHealthAccess } from '../../../core/platform';
import type { DateKey, Millis, SleepLog } from '../../../core/types';
import { importRange, sleepInputs, workoutInputs } from '../logic/healthImport';

/**
 * Import of sleep and workouts from Health Connect / HealthKit (#131) through `platform.ts`; nights go through
 * `saveSleep`, workouts through `saveWorkout`, both with `sourceId` + `externalId` (no duplicates on re-import, a
 * night already logged for the day is kept). Settings keys of this module: `health.import` — on/off, last run and
 * the last error; `health.import.dismissed` — imported nights the user deleted (`sourceId|externalId`): never again.
 */
const KEY = 'health.import';
const DISMISSED_KEY = 'health.import.dismissed';
/** `lastError`: the last run could read nothing (e.g. access withdrawn) — shown on the card. */
const State = z.object({ enabled: z.boolean(), lastRunAt: z.number().optional(), lastError: z.string().optional() });
const Dismissed = z.array(z.string());
const nightKey = (n: { sourceId?: string; externalId?: string }) => `${n.sourceId}|${n.externalId}`;
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

async function loadDismissed(): Promise<string[]> {
  const parsed = Dismissed.safeParse((await db.settings.get(DISMISSED_KEY))?.value);
  return parsed.success ? parsed.data : [];
}

/**
 * «Удалить запись»: deletes the night; an imported one is also remembered, so the next import does not bring it
 * back. (Workouts deleted in «Тренировки» need the same in the core write path — #244.)
 */
export async function removeSleep(log: SleepLog): Promise<void> {
  if (log.sourceId !== undefined && log.externalId !== undefined) {
    const dismissed = await loadDismissed();
    await db.settings.put({ key: DISMISSED_KEY, value: [...dismissed, nightKey(log)] });
  }
  await deleteSleep(log.id);
}

let running: Promise<HealthImportOutcome> | undefined;

/**
 * Reads the last 30 days and saves them; counts what the import itself holds now (a day already logged by hand or by
 * another app is kept and not counted). A night or workout the journal rejects is skipped. One run at a time.
 */
export function runHealthImport(today: DateKey, now: Millis = Date.now()): Promise<HealthImportOutcome> {
  running ??= importOnce(today, now).finally(() => {
    running = undefined;
  });
  return running;
}

async function importOnce(today: DateKey, now: Millis): Promise<HealthImportOutcome> {
  const { from, to } = importRange(today);
  const [sleep, workouts] = await Promise.all([readSleep(from, to), readWorkouts(from, to)]);
  const state = await loadHealthImport();
  if (sleep.status !== 'ok' && workouts.status !== 'ok') {
    await db.settings.put({ key: KEY, value: { ...state, lastRunAt: now, lastError: sleep.hint } });
    return sleep;
  }
  let nights = 0;
  if (sleep.status === 'ok') {
    const dismissed = new Set(await loadDismissed());
    for (const input of sleepInputs(sleep.items).filter((n) => !dismissed.has(nightKey(n)))) {
      try {
        const log = await saveSleep(input, now);
        if (log.sourceId === input.sourceId && log.externalId === input.externalId) nights++;
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
  const { lastError: _previous, ...rest } = state;
  await db.settings.put({ key: KEY, value: { ...rest, lastRunAt: now } });
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

/**
 * On app start and when it comes back: import if on and the last run is over an hour ago — or today's night is not
 * logged yet (the watch may sync it after the first look in the morning). Never rejects.
 */
export async function importIfDue(today: DateKey, now: Millis = Date.now()): Promise<void> {
  const state = await loadHealthImport();
  if (!state.enabled) return;
  const recent = state.lastRunAt !== undefined && now - state.lastRunAt < REIMPORT_AFTER_MS;
  if (recent && (await db.sleepLogs.where('date').equals(today).count()) > 0) return;
  try {
    const result = await runHealthImport(today, now);
    if (result.status !== 'ok') console.error('health import', result);
  } catch (e) {
    console.error('health import failed', e);
  }
}
