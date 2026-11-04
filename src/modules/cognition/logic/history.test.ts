import { describe, expect, it } from 'vitest';
import { HISTORY_DAYS, compareWithAverage, dailyMedians, type TestPoint } from './history';

const t = (date: string, medianRtMs: number, startedAt = 0): TestPoint => ({ date, medianRtMs, startedAt });

describe('dailyMedians', () => {
  it('Given ≥ 2 results When the module screen opens Then the median history covers the last 14 days', () => {
    const days = dailyMedians([t('2026-11-04', 300), t('2026-10-30', 280)], '2026-11-04');
    expect(days).toHaveLength(HISTORY_DAYS);
    expect(days[0].date).toBe('2026-10-22');
    expect(days[13]).toEqual({ date: '2026-11-04', medianRtMs: 300 });
    expect(days.find((d) => d.date === '2026-10-30')?.medianRtMs).toBe(280);
    expect(days.find((d) => d.date === '2026-10-31')?.medianRtMs).toBeUndefined();
  });

  it('several tests on one day are combined into their median', () => {
    const days = dailyMedians([t('2026-11-04', 300), t('2026-11-04', 260), t('2026-11-04', 290)], '2026-11-04');
    expect(days[13].medianRtMs).toBe(290);
  });

  it('results older than 14 days are left out', () => {
    const days = dailyMedians([t('2026-10-21', 999)], '2026-11-04');
    expect(days.every((d) => d.medianRtMs === undefined)).toBe(true);
  });
});

describe('compareWithAverage', () => {
  it('compares the latest result with my average of the earlier ones', () => {
    const c = compareWithAverage([t('2026-11-01', 300, 1), t('2026-11-04', 270, 3), t('2026-11-02', 320, 2)]);
    expect(c).toEqual({ latestMs: 270, averageMs: 310, diffMs: -40 });
  });

  it('needs at least two results', () => {
    expect(compareWithAverage([t('2026-11-04', 270)])).toBeUndefined();
    expect(compareWithAverage([])).toBeUndefined();
  });
});
