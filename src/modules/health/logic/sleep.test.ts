import { describe, expect, it } from 'vitest';
import {
  CHART_DAYS,
  DEFAULT_BEDTIME,
  DEFAULT_WAKE,
  averageHours,
  formatHours,
  formatHoursDiff,
  sleepChart,
  type SleepPoint,
} from './sleep';

const HOUR = 3_600_000;
const log = (date: string, hours: number): SleepPoint => ({ date, bedtime: 0, wakeTime: hours * HOUR });

describe('sleep form defaults', () => {
  it('Given I open «Сон» in the morning Then the default is last night: bedtime 23:30, wake-up 07:30', () => {
    expect(DEFAULT_BEDTIME).toBe('23:30');
    expect(DEFAULT_WAKE).toBe('07:30');
  });
});

describe('formatHours', () => {
  it('uses a Russian decimal comma and drops a trailing zero', () => {
    expect(formatHours(7.5)).toBe('7,5 ч');
    expect(formatHours(8)).toBe('8 ч');
    expect(formatHours(6.66)).toBe('6,7 ч');
  });
});

describe('sleepChart', () => {
  it('Given records for 14 days When the screen opens Then there is one bar per day, oldest first', () => {
    const bars = sleepChart([log('2026-11-04', 7.5), log('2026-10-22', 6), log('2026-10-21', 9)], '2026-11-04');
    expect(bars).toHaveLength(CHART_DAYS);
    expect(bars[0]).toEqual({ date: '2026-10-22', hours: 6 });
    expect(bars[13]).toEqual({ date: '2026-11-04', hours: 7.5 });
    expect(bars[5].hours).toBeUndefined();
  });
});

describe('averageHours', () => {
  it('Given records When the screen opens Then the 7-day average uses only the last 7 days with a record', () => {
    const logs = [log('2026-11-04', 8), log('2026-11-01', 6), log('2026-10-29', 7), log('2026-10-28', 2)];
    expect(averageHours(logs, '2026-11-04', 7)).toBe(7);
  });

  it('no records in the window → no average', () => {
    expect(averageHours([log('2026-10-01', 8)], '2026-11-04', 7)).toBeUndefined();
  });
});

describe('formatHoursDiff', () => {
  it('Given a sleep goal of 8 h and 6.5 h slept Then the difference reads «−1,5 ч»', () => {
    expect(formatHoursDiff(6.5 - 8)).toBe('−1,5 ч');
  });

  it('more sleep than the goal gets a plus sign; a match is «0 ч»', () => {
    expect(formatHoursDiff(0.5)).toBe('+0,5 ч');
    expect(formatHoursDiff(0.02)).toBe('0 ч');
  });
});

describe('stageSummary (#130)', () => {
  it('sums the minutes per stage in order deep, light, awake; empty without stages', async () => {
    const { stageSummary } = await import('./sleep');
    const M = 60_000;
    expect(
      stageSummary([
        { start: 0, end: 130 * M, stage: 'deep' },
        { start: 130 * M, end: 375 * M, stage: 'light' },
        { start: 375 * M, end: 390 * M, stage: 'awake' },
        { start: 390 * M, end: 400 * M, stage: 'deep' },
      ]),
    ).toBe('Глубокий сон 2 ч 20 мин · лёгкий 4 ч 5 мин · без сна 15 мин');
    expect(stageSummary([])).toBe('');
  });
});
