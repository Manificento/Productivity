import { shiftDateKey } from '../../../core/dates';
import { sleepHours } from '../../../core/logging/sleepTime';
import type { DateKey } from '../../../core/types';

/** The form opens on last night: to bed yesterday at 23:30, up today at 07:30. */
export const DEFAULT_BEDTIME = '23:30';
export const DEFAULT_WAKE = '07:30';
export const DEFAULT_QUALITY = 3;

export const CHART_DAYS = 14;

/** Fields of a sleep record the charts need. */
export interface SleepPoint {
  date: DateKey;
  bedtime: number;
  wakeTime: number;
}

export interface SleepBar {
  date: DateKey;
  /** Undefined on days without a record. */
  hours?: number;
}

/** '7,5 ч' — one decimal, Russian comma, no trailing ',0'. */
export function formatHours(hours: number): string {
  return `${(Math.round(hours * 10) / 10).toString().replace('.', ',')} ч`;
}

/** One bar per day for the 14 days ending `today`, oldest first. */
export function sleepChart(logs: SleepPoint[], today: DateKey): SleepBar[] {
  const byDate = new Map(logs.map((l) => [l.date, sleepHours(l)]));
  return Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = shiftDateKey(today, i - (CHART_DAYS - 1));
    const hours = byDate.get(date);
    return hours === undefined ? { date } : { date, hours };
  });
}

/** Mean sleep over the last `days` days ending `today`, counting only days with a record. */
export function averageHours(logs: SleepPoint[], today: DateKey, days: number): number | undefined {
  const from = shiftDateKey(today, -(days - 1));
  const inWindow = logs.filter((l) => l.date >= from && l.date <= today);
  if (inWindow.length === 0) return undefined;
  return inWindow.reduce((sum, l) => sum + sleepHours(l), 0) / inWindow.length;
}
