import { describe, expect, it } from 'vitest';
import type { LifeEvent } from '../types';
import { computeDailyTargets } from './engine';
import { DEFAULT_BASELINE, roundCapacity } from './rules';
import type { AdaptationContext } from './types';

const event = (over: Partial<LifeEvent>): LifeEvent => ({
  id: 'e',
  createdAt: 0,
  updatedAt: 0,
  title: 'Событие',
  type: 'deadline',
  date: '2026-11-10',
  importance: 1,
  prepDays: 1,
  ...over,
});

const ctx = (over: Partial<AdaptationContext> = {}): AdaptationContext => ({
  baseline: DEFAULT_BASELINE,
  events: [],
  ...over,
});

describe('overload: two events within 3 days', () => {
  it('Given два события в пределах 3 дней When считаются цели Then правило «перегрузка»: ёмкость −10%, причина в reasons', () => {
    const report = event({ id: 'a', title: 'Отчёт', date: '2026-11-02', importance: 2 });
    const defense = event({ id: 'b', title: 'Защита', date: '2026-11-04' });
    const one = computeDailyTargets('2026-11-01', ctx({ events: [report] }));
    const two = computeDailyTargets('2026-11-01', ctx({ events: [report, defense] }));
    expect(two.phase).toBe(one.phase);
    expect(two.taskCapacityMin).toBe(roundCapacity(one.taskCapacityMin * 0.9));
    expect(two.reasons).toContain('Событий за 3 дня: 2 («Отчёт», «Защита») — ёмкость −10%');
  });

  it('cuts 10% of a normal day when both events are 3 days away', () => {
    const t = computeDailyTargets(
      '2026-11-01',
      ctx({ events: [event({ id: 'a', date: '2026-11-04' }), event({ id: 'b', date: '2026-11-04' })] }),
    );
    expect(t.phase).toBe('normal');
    expect(t.taskCapacityMin).toBe(330); // 360 × 0.9 = 324, rounded to 15 minutes
  });

  it('does not fire for a single event or when the second one is further than 3 days', () => {
    const one = computeDailyTargets('2026-11-01', ctx({ events: [event({ date: '2026-11-04' })] }));
    expect(one.taskCapacityMin).toBe(DEFAULT_BASELINE.taskCapacityMin);
    const far = computeDailyTargets(
      '2026-11-01',
      ctx({ events: [event({ id: 'a', date: '2026-11-02' }), event({ id: 'b', date: '2026-11-05' })] }),
    );
    expect(far.reasons.join()).not.toMatch(/Событий за 3 дня/);
  });

  it('ignores events that are already over', () => {
    const t = computeDailyTargets(
      '2026-11-03',
      ctx({ events: [event({ id: 'a', date: '2026-11-02' }), event({ id: 'b', date: '2026-11-04' })] }),
    );
    expect(t.reasons.join()).not.toMatch(/Событий за 3 дня/);
  });
});

describe('sleep debt: three short nights in a row', () => {
  it('Given 3 ночи подряд сна < 6,5 ч When считаются цели Then отбой на 30 мин раньше, причина в reasons', () => {
    const t = computeDailyTargets('2026-11-04', ctx({ recentSleepHours: [6.2, 6, 6.4] }));
    expect(t.bedtime).toBe('23:00');
    expect(t.reasons).toContain('Три ночи подряд меньше 6,5 ч сна: отбой на 30 минут раньше');
  });

  it('does not fire when one of the three nights was long enough or is missing', () => {
    expect(computeDailyTargets('2026-11-04', ctx({ recentSleepHours: [6, 6.5, 6] })).bedtime).toBe('23:30');
    expect(computeDailyTargets('2026-11-04', ctx({ recentSleepHours: [6, undefined, 6] })).bedtime).toBe('23:30');
    expect(computeDailyTargets('2026-11-04', ctx({ recentSleepHours: [6, 6] })).bedtime).toBe('23:30');
  });
});

describe('hard workout yesterday', () => {
  it('Given вчера тренировка с RPE ≥ 8 When считаются цели Then сегодня интенсивность не выше moderate', () => {
    const t = computeDailyTargets('2026-11-04', ctx({ yesterdayMaxRpe: 8 }));
    expect(t.maxWorkoutIntensity).toBe('moderate');
    expect(t.reasons).toContain('Вчера тяжёлая тренировка (RPE 8): сегодня не выше умеренной');
  });

  it('keeps a lower cap and ignores easier workouts', () => {
    expect(computeDailyTargets('2026-11-04', ctx({ yesterdayMaxRpe: 7 })).maxWorkoutIntensity).toBe('hard');
    const light = computeDailyTargets('2026-11-04', ctx({ yesterdayMaxRpe: 9, lastSleepHours: 5 }));
    expect(light.maxWorkoutIntensity).toBe('light');
    expect(light.reasons.join()).not.toMatch(/тяжёлая тренировка/);
  });
});

describe('interactions', () => {
  it('counts every event in the window', () => {
    const t = computeDailyTargets(
      '2026-11-01',
      ctx({
        events: ['a', 'b', 'c'].map((id) => event({ id, title: id.toUpperCase(), date: '2026-11-04' })),
      }),
    );
    expect(t.reasons).toContain('Событий за 3 дня: 3 («A», «B», «C») — ёмкость −10%');
  });

  it('does not claim a cut when capacity is already at the rounding floor', () => {
    const tiny = { ...DEFAULT_BASELINE, taskCapacityMin: 15 };
    const t = computeDailyTargets(
      '2026-11-01',
      ctx({ baseline: tiny, events: [event({ id: 'a', date: '2026-11-04' }), event({ id: 'b', date: '2026-11-04' })] }),
    );
    expect(t.taskCapacityMin).toBe(15);
    expect(t.reasons).toEqual([]);
  });

  it('sleep debt stacks with taper: bedtime one hour earlier', () => {
    const t = computeDailyTargets(
      '2026-11-09',
      ctx({ events: [event({ date: '2026-11-10' })], recentSleepHours: [6, 6, 6] }),
    );
    expect(t.phase).toBe('taper');
    expect(t.bedtime).toBe('22:30');
  });
});
