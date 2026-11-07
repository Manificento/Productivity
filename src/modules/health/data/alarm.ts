import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { db } from '../../../core/db';
import { cancelAlarm, setAlarm, type AlarmDismissal, type AlarmResult } from '../../../core/platform';
import type { Millis } from '../../../core/types';

/**
 * The alarm (#129) through `platform.ts` only. Settings keys of this module (`health.*`, architecture: «модуль пишет
 * только свои ключи»): `health.alarm` — on/off and the time it is set for; `health.alarm.dismissal` — the last
 * switch-off not yet answered with «Я встал» / «Не сейчас».
 */
const STATE_KEY = 'health.alarm';
const DISMISSAL_KEY = 'health.alarm.dismissal';

const State = z.object({ enabled: z.boolean(), at: z.number().optional() });
export type AlarmState = z.infer<typeof State>;
const Dismissal = z.object({ dismissedAt: z.number(), alarmAt: z.number() });

export async function loadAlarmState(): Promise<AlarmState> {
  const parsed = State.safeParse((await db.settings.get(STATE_KEY))?.value);
  return parsed.success ? parsed.data : { enabled: false };
}

export function useAlarmState(): AlarmState | undefined {
  return useLiveQuery(loadAlarmState, []);
}

/**
 * Turns the alarm on for `at` (the start of the next wake window). The native alarm rings once: `keepArmed` sets the
 * next one. Until the smart moment exists (NV4) it rings at `at` itself (`windowMin: 0`). Off and why, if refused.
 */
export async function enableAlarm(at: Millis): Promise<AlarmResult> {
  const result = await setAlarm({ at, windowMin: 0 });
  await db.settings.put({
    key: STATE_KEY,
    value: result.status === 'set' ? { enabled: true, at } : { enabled: false },
  });
  return result;
}

export async function disableAlarm(): Promise<void> {
  await cancelAlarm();
  await db.settings.put({ key: STATE_KEY, value: { enabled: false } });
}

/** While on: once the set alarm is behind us (it rang), set the next window's. Never rejects. */
export async function keepArmed(next: Millis | undefined): Promise<void> {
  const state = await loadAlarmState();
  if (!state.enabled || next === undefined) return;
  if (state.at !== undefined && state.at > Date.now() && state.at === next) return;
  const result = await setAlarm({ at: next, windowMin: 0 });
  if (result.status === 'set') await db.settings.put({ key: STATE_KEY, value: { enabled: true, at: next } });
  else console.error('keepArmed: alarm not set', result);
}

export async function recordDismissal(d: AlarmDismissal): Promise<void> {
  await db.settings.put({ key: DISMISSAL_KEY, value: { dismissedAt: d.dismissedAt, alarmAt: d.alarmAt } });
}

export async function loadDismissal(): Promise<AlarmDismissal | undefined> {
  const parsed = Dismissal.safeParse((await db.settings.get(DISMISSAL_KEY))?.value);
  return parsed.success ? parsed.data : undefined;
}

export function useDismissal(): AlarmDismissal | undefined | null {
  return useLiveQuery(loadDismissal, [], null);
}

export async function clearDismissal(): Promise<void> {
  await db.settings.delete(DISMISSAL_KEY);
}
