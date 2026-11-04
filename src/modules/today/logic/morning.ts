import { format } from 'date-fns';
import { z } from 'zod';
import { sleepWindow } from '../../../core/logging/sleepTime';
import type { DateKey, Millis, SleepLog } from '../../../core/types';

export type MorningStep = 'sleep' | 'checkIn' | 'test';
export const MORNING_STEPS: MorningStep[] = ['sleep', 'checkIn', 'test'];

export interface SleepSuggestion {
  /** 'HH:mm' */
  bedtime: string;
  /** 'HH:mm' */
  wake: string;
  quality: number;
}

const DEFAULT_WAKE = '07:30';

/** The morning flow opens at 04:00: before that the user has usually not slept yet. */
export const MORNING_OPENS_AT_HOUR = 4;

export function isMorningOpen(now: Millis): boolean {
  return new Date(now).getHours() >= MORNING_OPENS_AT_HOUR;
}

/** Current local time 'HH:mm', rounded down to 5 minutes. */
function nowHHmm(now: Millis): string {
  const d = new Date(now);
  d.setMinutes(d.getMinutes() - (d.getMinutes() % 5));
  return format(d, 'HH:mm');
}

/**
 * One-tap suggestion: last night's clock times, or the baseline bedtime and 07:30.
 * The wake time is never later than now, so «Подтвердить» cannot save a night that has not ended.
 */
export function suggestSleep(last: SleepLog | undefined, baselineBedtime: string, now: Millis): SleepSuggestion {
  const s = last
    ? { bedtime: format(last.bedtime, 'HH:mm'), wake: format(last.wakeTime, 'HH:mm'), quality: last.quality }
    : { bedtime: baselineBedtime, wake: DEFAULT_WAKE, quality: 3 };
  const current = nowHHmm(now);
  return s.wake > current ? { ...s, wake: current } : s;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A night for `saveSleep` (which validates durations itself). */
export interface MorningSleepInput {
  bedtime: number;
  wakeTime: number;
  quality: number;
}

/** Clock times → the night that ended on `today`; the wake-up must not be in the future. */
export function parseMorningSleep(
  today: DateKey,
  s: SleepSuggestion,
  now: Millis,
): { ok: true; input: MorningSleepInput } | { ok: false; error: string } {
  if (!HHMM.test(s.bedtime) || !HHMM.test(s.wake)) return { ok: false, error: 'Укажите время отбоя и подъёма' };
  const window = sleepWindow(today, s.bedtime, s.wake);
  if (window.wakeTime > now) return { ok: false, error: 'Время подъёма ещё не наступило' };
  return { ok: true, input: { ...window, quality: s.quality } };
}

export type StepState = 'done' | 'skipped' | 'pending';

export function morningSteps(
  done: Record<MorningStep, boolean>,
  skipped: MorningStep[],
): { steps: { step: MorningStep; state: StepState }[]; complete: boolean } {
  const steps = MORNING_STEPS.map((step) => ({
    step,
    state: (done[step] ? 'done' : skipped.includes(step) ? 'skipped' : 'pending') as StepState,
  }));
  return { steps, complete: steps.every((s) => s.state !== 'pending') };
}

/** Stored under `adaptation.morning`: steps skipped on one day. */
export interface MorningSkips {
  date: DateKey;
  skipped: MorningStep[];
}

const skipsSchema = z.object({ date: z.string(), skipped: z.array(z.string()) });

export function readSkipped(raw: unknown, today: DateKey): MorningStep[] {
  const r = skipsSchema.safeParse(raw);
  if (!r.success || r.data.date !== today) return [];
  return r.data.skipped.filter((s): s is MorningStep => (MORNING_STEPS as string[]).includes(s));
}

export function withSkipped(raw: unknown, today: DateKey, step: MorningStep): MorningSkips {
  const current = readSkipped(raw, today);
  return { date: today, skipped: current.includes(step) ? current : [...current, step] };
}
