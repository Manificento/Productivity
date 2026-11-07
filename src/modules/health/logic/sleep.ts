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

/** '−1,5 ч' / '+0,5 ч' / '0 ч' — signed, one decimal, Russian comma, typographic minus. */
export function formatHoursDiff(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  if (rounded === 0) return '0 ч';
  const abs = Math.abs(rounded).toString().replace('.', ',');
  return `${rounded < 0 ? '−' : '+'}${abs} ч`;
}

const STAGE_ORDER = [
  ['deep', 'Глубокий сон'],
  ['light', 'лёгкий'],
  ['rem', 'быстрый'],
  ['awake', 'без сна'],
] as const;

const hoursMinutes = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
};

/** «Глубокий сон 2 ч 20 мин · лёгкий 4 ч 5 мин · без сна 15 мин» — minutes per stage (#130); '' without stages. */
export function stageSummary(stages: readonly { start: number; end: number; stage: string }[]): string {
  const minutes = new Map<string, number>();
  for (const s of stages) minutes.set(s.stage, (minutes.get(s.stage) ?? 0) + (s.end - s.start) / 60_000);
  return STAGE_ORDER.filter(([stage]) => (minutes.get(stage) ?? 0) > 0)
    .map(([stage, label]) => `${label} ${hoursMinutes(minutes.get(stage)!)}`)
    .join(' · ');
}
