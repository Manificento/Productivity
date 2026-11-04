import { fromDateKey, shiftDateKey } from '../dates';
import type { DateKey, Millis } from '../types';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Local time 'HH:mm' on a given day → epoch ms. */
export function atLocalTime(day: DateKey, hhmm: string): Millis {
  const match = HHMM.exec(hhmm);
  if (!match) throw new Error(`Время должно быть в формате ЧЧ:ММ, получено «${hhmm}»`);
  const [h, m] = [Number(match[1]), Number(match[2])];
  const d = fromDateKey(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/**
 * Turns the two clock times a person enters ("лёг 23:30", "встал 07:00") into a sleep window
 * for the night that ended on `wakeDay`. A bedtime later than the wake time on the clock
 * means the person went to bed the previous evening.
 */
export function sleepWindow(
  wakeDay: DateKey,
  bedtimeHHmm: string,
  wakeHHmm: string,
): { bedtime: Millis; wakeTime: Millis } {
  const wakeTime = atLocalTime(wakeDay, wakeHHmm);
  const sameDayBed = atLocalTime(wakeDay, bedtimeHHmm);
  const bedtime = sameDayBed <= wakeTime ? sameDayBed : atLocalTime(shiftDateKey(wakeDay, -1), bedtimeHHmm);
  return { bedtime, wakeTime };
}

/** Hours between bedtime and wake time. */
export function sleepHours(log: { bedtime: Millis; wakeTime: Millis }): number {
  return (log.wakeTime - log.bedtime) / 3_600_000;
}
