import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { db, softDelete } from '../../../core/db';
import { cancelAlarm, setAlarm, type AlarmDismissal, type AlarmResult } from '../../../core/platform';
import type { Millis } from '../../../core/types';
import { stopNightSensing } from '../../../core/platform';

/**
 * The alarm (#129) through `platform.ts` only. Settings keys of this module (`health.*`, architecture: «модуль пишет
 * только свои ключи»): `health.alarm` — on/off and the time it is set for; `health.alarm.dismissal` — the last
 * switch-off not yet answered with «Я встал» / «Не сейчас».
 */
const STATE_KEY = 'health.alarm';
const DISMISSAL_KEY = 'health.alarm.dismissal';

/** `error`: the last attempt to set the next alarm failed — why (shown on the card; nothing will ring). */
const State = z.object({
  enabled: z.boolean(),
  at: z.number().optional(),
  windowMin: z.number().optional(),
  error: z.string().optional(),
  /** The last switch-off: today's window is done once it is switched off (`nextAlarm`). */
  lastDismissedAt: z.number().optional(),
});
export type AlarmState = z.infer<typeof State>;
const Dismissal = z.object({ dismissedAt: z.number(), alarmAt: z.number() });

export async function loadAlarmState(): Promise<AlarmState> {
  const parsed = State.safeParse((await db.settings.get(STATE_KEY))?.value);
  return parsed.success ? parsed.data : { enabled: false };
}

export function useAlarmState(): AlarmState | undefined {
  return useLiveQuery(loadAlarmState, []);
}

/** The alarm for one wake window: `at` — the wake time (its end), `windowMin` — its length (#130). */
export interface AlarmWindow {
  at: Millis;
  windowMin: number;
}

/**
 * Turns the alarm on for a wake window. The native alarm repeats daily (#241) and, with night sensing on («Спать»),
 * rings in light sleep inside the window, at its start without data (#250); `keepArmed` moves it onto each day's
 * window. Off and why, if refused.
 */
export async function enableAlarm(w: AlarmWindow): Promise<AlarmResult> {
  const result = await setAlarm({ at: w.at, windowMin: w.windowMin });
  const { lastDismissedAt } = await loadAlarmState();
  const keep = lastDismissedAt !== undefined ? { lastDismissedAt } : {};
  await db.settings.put({
    key: STATE_KEY,
    value:
      result.status === 'set'
        ? { enabled: true, at: w.at, windowMin: w.windowMin, ...keep }
        : { enabled: false, ...keep },
  });
  return result;
}

export async function disableAlarm(): Promise<void> {
  await cancelAlarm();
  const { lastDismissedAt } = await loadAlarmState();
  await db.settings.put({
    key: STATE_KEY,
    value: { enabled: false, ...(lastDismissedAt !== undefined && { lastDismissedAt }) },
  });
}

/**
 * While on: sets the next window's alarm (`setAlarm` replaces the native one). Skips when that very alarm is already
 * set and ahead, unless `force` (app start: after a restore or reinstall the stored state may outlive the native
 * alarm). A failure is stored with its hint for the card. Switched off meanwhile — the alarm is cancelled again.
 * Never rejects.
 */
/**
 * While on: sets the alarm for the window `pick` chooses from the last switch-off (`setAlarm` replaces the native one).
 * The window it is already set for stays untouched while pending — also on `force`: inside the window it may ring any
 * minute. `force` (app start) otherwise re-sets the same alarm: the stored state may outlive the native one. A failure
 * is stored with its hint for the card. Switched off meanwhile — the alarm is cancelled again. Never rejects.
 */
export async function keepArmed(
  pick: (lastDismissedAt?: Millis) => AlarmWindow | undefined,
  { force = false } = {},
): Promise<void> {
  const state = await loadAlarmState();
  if (!state.enabled) return;
  const next = pick(state.lastDismissedAt);
  if (next === undefined) return;
  const same = !state.error && state.at === next.at && state.windowMin === next.windowMin;
  const now = Date.now();
  const windowBegun = now >= next.at - next.windowMin * 60_000;
  if (same && next.at > now && (!force || windowBegun)) return;
  const result = await setAlarm({ at: next.at, windowMin: next.windowMin });
  const after = await loadAlarmState();
  if (!after.enabled) {
    // The user switched it off while it was being set: keep it off.
    await cancelAlarm();
    return;
  }
  const keep = after.lastDismissedAt !== undefined ? { lastDismissedAt: after.lastDismissedAt } : {};
  await db.settings.put({
    key: STATE_KEY,
    value:
      result.status === 'set'
        ? { enabled: true, at: next.at, windowMin: next.windowMin, ...keep }
        : { enabled: true, error: result.hint, ...keep },
  });
}

/**
 * A switch-off: kept for «Я встал», remembered so today's window counts as done, and the night recording stops (its
 * buffer stays for «Я встал»; the microphone service must not run all day).
 */
export async function recordDismissal(d: AlarmDismissal): Promise<void> {
  await db.settings.put({ key: DISMISSAL_KEY, value: { dismissedAt: d.dismissedAt, alarmAt: d.alarmAt } });
  const state = await loadAlarmState();
  await db.settings.put({ key: STATE_KEY, value: { ...state, lastDismissedAt: d.dismissedAt } });
  await stopNightSensing();
}

export async function loadDismissal(): Promise<AlarmDismissal | undefined> {
  const parsed = Dismissal.safeParse((await db.settings.get(DISMISSAL_KEY))?.value);
  return parsed.success ? parsed.data : undefined;
}

export function useDismissal(): AlarmDismissal | undefined | null {
  return useLiveQuery(loadDismissal, [], null);
}

export async function clearDismissal(): Promise<void> {
  await softDelete(db.settings, DISMISSAL_KEY);
}
