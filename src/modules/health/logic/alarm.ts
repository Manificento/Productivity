import { format } from 'date-fns';
import { shiftDateKey, toDateKey } from '../../../core/dates';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { DateKey, Millis } from '../../../core/types';

/** The alarm targets of a wake-up day (`useDailyTargets`): wake time and the window before it. */
export interface WakeTargets {
  wakeTime: string;
  wakeWindowMin: number;
}

const MINUTE = 60_000;

/** Start of the wake window of `wakeDay` (it may be the evening before when the window crosses midnight). */
export function windowStartAt(wakeDay: DateKey, wakeTime: string, windowMin: number): Millis {
  return atLocalTime(wakeDay, wakeTime) - windowMin * MINUTE;
}

/** «6:30–7:00». */
export function windowLabel(wakeDay: DateKey, wakeTime: string, windowMin: number): string {
  const end = atLocalTime(wakeDay, wakeTime);
  return `${format(end - windowMin * MINUTE, 'H:mm')}–${format(end, 'H:mm')}`;
}

/**
 * When the alarm rings next: the start of the wake window of today or tomorrow, whichever is still ahead of `now`.
 * Until the smart moment inside the window exists (sleep phases, NV4) the alarm rings at the start of the window.
 */
export function nextAlarm(
  now: Millis,
  targetsFor: (wakeDay: DateKey) => WakeTargets | undefined,
): { at: Millis; wakeDay: DateKey } | undefined {
  const today = toDateKey(now);
  for (const wakeDay of [today, shiftDateKey(today, 1)]) {
    const t = targetsFor(wakeDay);
    if (!t) continue;
    const at = windowStartAt(wakeDay, t.wakeTime, t.wakeWindowMin);
    if (at > now) return { at, wakeDay };
  }
  return undefined;
}

/** «Я встал»: last night to log — woke when the alarm was switched off, went to bed at the bedtime target. */
export function sleepOffer(
  dismissal: { dismissedAt: Millis; alarmAt: Millis },
  bedtimeTarget: string,
): { wakeDay: DateKey; bedtime: string; wake: string } {
  return {
    wakeDay: toDateKey(dismissal.dismissedAt),
    bedtime: bedtimeTarget,
    wake: format(dismissal.dismissedAt, 'HH:mm'),
  };
}
