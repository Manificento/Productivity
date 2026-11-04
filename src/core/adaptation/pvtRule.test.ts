import { describe, expect, it } from 'vitest';
import { computeDailyTargets } from './engine';
import { DEFAULT_BASELINE, pvtNorm } from './rules';
import type { AdaptationContext } from './types';

const ctx = (over: Partial<AdaptationContext> = {}): AdaptationContext => ({
  baseline: DEFAULT_BASELINE,
  events: [],
  ...over,
});

// Seven runs of the last 14 days (most recent first): norm = median = 300 ms.
const history = [300, 290, 310, 300, 280, 320, 300];

describe('PVT rule', () => {
  it('Given ≥ 7 результатов PVT за 14 дней When считается личная норма Then медиана медиан за эти дни', () => {
    expect(pvtNorm(history)).toBe(300);
    expect(pvtNorm([...history, 400])).toBe(300); // 8 values: mean of the two middle ones (300, 300)
    expect(pvtNorm([250, 260, 270, 280, 290, 300, 310, 320])).toBe(285);
  });

  it('Given сегодняшняя медиана хуже нормы на ≥ 20% When считаются цели Then отсечка кофеина на 2 ч раньше, ёмкость −10%, причина «Внимание ниже нормы: …»', () => {
    const t = computeDailyTargets('2026-11-04', ctx({ recentPvtMediansMs: [360, ...history], todayPvtMedianMs: 360 }));
    expect(t.caffeineCutoff).toBe('13:00'); // 15:00 − 2 h
    expect(t.taskCapacityMin).toBe(330); // 360 × 0.9, rounded to 15 min
    expect(t.reasons).toContain(
      'Внимание ниже нормы: тест 360 мс против обычных 300 мс — кофеин до 13:00, нагрузка −10%',
    );
  });

  it('just under 20 % slower, or no test today, changes nothing', () => {
    const base = computeDailyTargets('2026-11-04', ctx());
    const slightly = computeDailyTargets(
      '2026-11-04',
      ctx({ recentPvtMediansMs: [359, ...history], todayPvtMedianMs: 359 }),
    );
    expect(slightly.caffeineCutoff).toBe(base.caffeineCutoff);
    expect(slightly.taskCapacityMin).toBe(base.taskCapacityMin);
    const noTestToday = computeDailyTargets('2026-11-04', ctx({ recentPvtMediansMs: [400, ...history] }));
    expect(noTestToday.reasons.some((r) => r.startsWith('Внимание ниже нормы'))).toBe(false);
  });

  it('Given < 7 результатов When считаются цели Then правило не срабатывает', () => {
    const t = computeDailyTargets(
      '2026-11-04',
      ctx({ recentPvtMediansMs: [500, 300, 300, 300, 300, 300], todayPvtMedianMs: 500 }),
    );
    expect(t.caffeineCutoff).toBe(DEFAULT_BASELINE.caffeineCutoff);
    expect(t.reasons.some((r) => r.startsWith('Внимание ниже нормы'))).toBe(false);
    expect(pvtNorm([300, 300, 300, 300, 300, 300])).toBeUndefined();
  });
});
