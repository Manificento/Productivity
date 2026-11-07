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
 * The wake window the alarm is for: today's while it has not been switched off (its wake time `at` still ahead and no
 * switch-off since its start — inside the window the alarm may not have rung yet), else tomorrow's. `at` is the wake
 * time (the window's end), `windowMin` its length. The native smart alarm (#250) rings in light sleep inside it, at
 * the start without night-sensing data, at `at` at the latest.
 */
export function nextAlarm(
  now: Millis,
  targetsFor: (wakeDay: DateKey) => WakeTargets | undefined,
  lastDismissedAt?: Millis,
): { at: Millis; windowMin: number; start: Millis; wakeDay: DateKey } | undefined {
  const today = toDateKey(now);
  for (const wakeDay of [today, shiftDateKey(today, 1)]) {
    const t = targetsFor(wakeDay);
    if (!t) continue;
    const start = windowStartAt(wakeDay, t.wakeTime, t.wakeWindowMin);
    const at = atLocalTime(wakeDay, t.wakeTime);
    const switchedOff = lastDismissedAt !== undefined && lastDismissedAt >= start;
    if (at > now && !switchedOff) return { at, windowMin: t.wakeWindowMin, start, wakeDay };
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
