import { describe, expect, it } from 'vitest';
import type { CheckIn, LifeEvent } from '../types';
import { computeDailyTargets } from './engine';
import { baselineTargets, DEFAULT_BASELINE, nutritionTargets } from './rules';
import type { AdaptationContext } from './types';

const exam: LifeEvent = {
  id: 'e1',
  createdAt: 0,
  updatedAt: 0,
  title: 'IELTS',
  type: 'exam',
  date: '2026-11-10',
  importance: 3,
  prepDays: 7,
};

const ctx = (over: Partial<AdaptationContext> = {}): AdaptationContext => ({
  baseline: DEFAULT_BASELINE,
  events: [exam],
  ...over,
});

const nutrition = {
  expenditureKcal: 2500,
  nutritionGoal: { kind: 'lose' as const, ratePct: 0.5 },
  weightKg: 80,
};

describe('DailyTargets v2', () => {
  it('Given DailyTargets v1 When я смотрю types.ts Then добавлены новые поля, существующие не изменены', () => {
    const t = baselineTargets('2026-11-01', DEFAULT_BASELINE);
    const v1 = [
      'date',
      'phase',
      'taskCapacityMin',
      'allowDeferLowPriority',
      'sleepHours',
      'bedtime',
      'maxWorkoutIntensity',
      'focusPomodoros',
      'meditationMin',
      'caffeineCutoff',
      'noNewFoods',
      'reasons',
    ];
    expect(Object.keys(t)).toEqual(expect.arrayContaining(v1));
    expect(t).toMatchObject({
      // v1 fields keep their names
      taskCapacityMin: DEFAULT_BASELINE.taskCapacityMin,
      sleepHours: DEFAULT_BASELINE.sleepHours,
      bedtime: DEFAULT_BASELINE.bedtime,
      focusPomodoros: DEFAULT_BASELINE.focusPomodoros,
      meditationMin: DEFAULT_BASELINE.meditationMin,
      // v2 defaults on a normal day
      habitsMode: 'all',
      wakeTime: DEFAULT_BASELINE.wakeTime,
      wakeWindowMin: 30,
      deload: false,
      meditationKind: 'focus',
      mindTrainingMin: DEFAULT_BASELINE.mindTrainingMin,
    });
    expect(t.kcal).toBeUndefined();
  });

  it('Given фаза taper или event When считаются цели Then deload = true, mindTrainingMin ≤ 5, kcal не ниже expenditureKcal; причина в reasons', () => {
    for (const date of ['2026-11-09', '2026-11-10']) {
      const t = computeDailyTargets(date, ctx(nutrition));
      expect(t.deload).toBe(true);
      expect(t.mindTrainingMin).toBeLessThanOrEqual(5);
      expect(t.kcal).toBeGreaterThanOrEqual(nutrition.expenditureKcal);
      expect(t.reasons.some((r) => r.includes('без дефицита калорий'))).toBe(true);
    }
    // An uneven expenditure is not rounded below itself.
    for (const date of ['2026-11-09', '2026-11-10']) {
      const t = computeDailyTargets(date, ctx({ ...nutrition, expenditureKcal: 2504 }));
      expect(t.kcal).toBeGreaterThanOrEqual(2504);
      expect(t.proteinG).toBe(144); // protein stays as for the goal (1.8 g/kg)
    }
    // Without a deficit to remove, the reason does not claim one.
    const gain = computeDailyTargets(
      '2026-11-09',
      ctx({ ...nutrition, nutritionGoal: { kind: 'gain', ratePct: 0.25 } }),
    );
    expect(gain.reasons.some((r) => r.includes('без дефицита калорий'))).toBe(false);
    // Before taper (prep) the deficit stays.
    const prep = computeDailyTargets('2026-11-05', ctx(nutrition));
    expect(prep.deload).toBe(false);
    expect(prep.kcal).toBeLessThan(nutrition.expenditureKcal);
  });

  it('Given фаза event When считаются цели Then habitsMode = essential, meditationKind = breathing; в recovery — meditationKind = body', () => {
    expect(computeDailyTargets('2026-11-10', ctx())).toMatchObject({
      phase: 'event',
      habitsMode: 'essential',
      meditationKind: 'breathing',
    });
    expect(computeDailyTargets('2026-11-11', ctx())).toMatchObject({ phase: 'recovery', meditationKind: 'body' });
    expect(computeDailyTargets('2026-11-11', ctx()).habitsMode).toBe('all');
  });

  it('Given чек-ин с энергией ≤ 2 When считаются цели Then mindTrainingMin = 0', () => {
    const checkIn: CheckIn = { id: 'c', date: '2026-11-01', energy: 2, focus: 3, createdAt: 0, updatedAt: 0 };
    expect(computeDailyTargets('2026-11-01', ctx({ events: [], checkIn })).mindTrainingMin).toBe(0);
    expect(
      computeDailyTargets('2026-11-01', ctx({ events: [], checkIn: { ...checkIn, energy: 3 } })).mindTrainingMin,
    ).toBe(DEFAULT_BASELINE.mindTrainingMin);
  });

  it('Given контекст без данных о весе и цели питания When считаются цели Then kcal, proteinG, fatG, carbsG — undefined, остальные поля как раньше', () => {
    const without = computeDailyTargets('2026-11-05', ctx());
    const partial = computeDailyTargets('2026-11-05', ctx({ expenditureKcal: 2500 }));
    for (const t of [without, partial]) {
      expect([t.kcal, t.proteinG, t.fatG, t.carbsG]).toEqual([undefined, undefined, undefined, undefined]);
    }
    const { kcal: _k, proteinG: _p, fatG: _f, carbsG: _c, ...rest } = computeDailyTargets('2026-11-05', ctx(nutrition));
    expect(rest).toEqual(without);
  });
});

describe('nutritionTargets', () => {
  it('lose 0.5 %/week at 80 kg: deficit ≈ 440 kcal, protein 1.8 g/kg, fat 0.8 g/kg, carbs fill the rest', () => {
    // 80 kg × 0.5% = 0.4 kg/week × 7700 kcal / 7 days = 440 kcal/day
    expect(nutritionTargets(2500, { kind: 'lose', ratePct: 0.5 }, 80)).toEqual({
      kcal: 2060,
      proteinG: 144,
      fatG: 64,
      carbsG: 227,
    });
  });

  it('maintain eats the expenditure; gain adds a surplus; a deficit never exceeds 25 % of expenditure', () => {
    expect(nutritionTargets(2500, { kind: 'maintain', ratePct: 0 }, 80).kcal).toBe(2500);
    expect(nutritionTargets(2500, { kind: 'gain', ratePct: 0.25 }, 80).kcal).toBe(2720);
    expect(nutritionTargets(2000, { kind: 'lose', ratePct: 1.5 }, 100).kcal).toBe(1500);
    expect(nutritionTargets(2000, { kind: 'gain', ratePct: 1.5 }, 100).kcal).toBe(2500); // surplus capped at 25 %
  });

  it('carbs never go negative', () => {
    expect(nutritionTargets(1200, { kind: 'maintain', ratePct: 0 }, 150).carbsG).toBe(0);
  });
});
