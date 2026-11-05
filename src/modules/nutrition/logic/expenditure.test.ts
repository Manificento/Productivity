import { describe, expect, it } from 'vitest';
import { shiftDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { estimateExpenditure, needsRefresh, parseProfile, starterExpenditure, type EstimateInput } from './expenditure';

const TODAY: DateKey = '2026-11-04';
const dayAgo = (n: number) => shiftDateKey(TODAY, -n);

/** Synthetic window: `days` days ending today, weight(i) for i = days ago, intake every day except `skip`. */
function series(opts: {
  weight: (daysAgo: number) => number;
  kcal: number;
  days?: number;
  skipWeight?: (daysAgo: number) => boolean;
  skipFood?: (daysAgo: number) => boolean;
}): EstimateInput {
  const days = opts.days ?? 28;
  const weights = [];
  const intakeByDay = new Map<DateKey, number>();
  for (let i = days - 1; i >= 0; i--) {
    if (!opts.skipWeight?.(i)) weights.push({ date: dayAgo(i), kg: opts.weight(i) });
    if (!opts.skipFood?.(i)) intakeByDay.set(dayAgo(i), opts.kcal);
  }
  return { today: TODAY, weights, intakeByDay };
}

describe('measured expenditure', () => {
  it('Given стабильный вес и приём 2500 When считаю расход Then 2500', () => {
    const r = estimateExpenditure(series({ weight: () => 80, kcal: 2500 }));
    expect(r).toMatchObject({ kind: 'measured', kcal: 2500 });
  });

  it('Given вес падает на 0,5 кг в неделю и приём 2000 When считаю Then расход ≈ 2000 + 0,5·7700/7 = 2550', () => {
    const r = estimateExpenditure(series({ weight: (i) => 80 + (i * 0.5) / 7, kcal: 2000 }));
    expect(r).toMatchObject({ kind: 'measured', kcal: 2550 });
  });

  it('Given вес растёт на 0,25 кг в неделю When считаю Then расход ниже приёма', () => {
    const r = estimateExpenditure(series({ weight: (i) => 80 - (i * 0.25) / 7, kcal: 3000 }));
    expect(r).toMatchObject({ kind: 'measured', kcal: 2730 });
  });

  it('Given пропуски дней в весе и еде (но ≥ 14 и ≥ 10 дней) When считаю Then оценка та же', () => {
    const r = estimateExpenditure(
      series({
        weight: (i) => 80 + (i * 0.5) / 7,
        kcal: 2000,
        skipWeight: (i) => i % 7 === 3, // 4 gaps: 24 weigh-ins left
        skipFood: (i) => i % 2 === 1, // 14 diary days left
      }),
    );
    expect(r).toMatchObject({ kind: 'measured', kcal: 2550 });
  });

  it('Given шум веса ±1 кг вокруг стабильного When считаю Then расход близок к приёму', () => {
    const r = estimateExpenditure(series({ weight: (i) => 80 + (i % 2 ? 1 : -1), kcal: 2500 }));
    expect(r?.kind).toBe('measured');
    expect(Math.abs((r?.kcal ?? 0) - 2500)).toBeLessThanOrEqual(150);
  });
});

describe('starter estimate', () => {
  const profile = { heightCm: 180, birthYear: 1996, sex: 'male' as const };

  it('Given 80 кг, 180 см, 30 лет, мужчина When считаю старт Then Mifflin–St Jeor × 1,4 ≈ 2670', () => {
    // BMR = 10·80 + 6,25·180 − 5·30 + 5 = 1780; × 1,4 = 2492 → 2490
    expect(starterExpenditure(profile, 80, 2026)).toBe(2490);
  });

  it('Given женщина When считаю старт Then −161 вместо +5', () => {
    // BMR = 800 + 1125 − 150 − 161 = 1614; × 1,4 = 2259.6 → 2260
    expect(starterExpenditure({ ...profile, sex: 'female' }, 80, 2026)).toBe(2260);
  });

  it('Given данных меньше порога When считаю расход Then стартовая оценка с числом дней до уточнения', () => {
    const input = series({ weight: () => 80, kcal: 2500, days: 5 });
    expect(estimateExpenditure(input, { profile, weightKg: 80, year: 2026 })).toEqual({
      kind: 'starter',
      kcal: 2490,
      daysLeft: 9,
    });
  });

  it('Given данных меньше порога и нет профиля When считаю расход Then оценки нет', () => {
    expect(estimateExpenditure(series({ weight: () => 80, kcal: 2500, days: 5 }))).toBeUndefined();
  });

  it('Given 14 дней веса, но 9 дней дневника When считаю Then ещё не измеренный расход', () => {
    const input = series({ weight: () => 80, kcal: 2500, skipFood: (i) => i >= 9 });
    const r = estimateExpenditure(input, { profile, weightKg: 80, year: 2026 });
    expect(r).toMatchObject({ kind: 'starter', daysLeft: 1 });
  });
});

describe('profile', () => {
  it('validates height, birth year and sex', () => {
    expect(parseProfile({ heightCm: '180', birthYear: '1996', sex: 'male' }, 2026)).toEqual({
      ok: true,
      value: { heightCm: 180, birthYear: 1996, sex: 'male' },
    });
    expect(parseProfile({ heightCm: '20', birthYear: '1996', sex: 'male' }, 2026).ok).toBe(false);
    expect(parseProfile({ heightCm: '180', birthYear: '2030', sex: 'male' }, 2026).ok).toBe(false);
  });
});

describe('weekly recompute', () => {
  const now = Date.UTC(2026, 10, 4);
  const week = 7 * 24 * 3600 * 1000;
  it('refreshes when nothing is stored, when a week has passed, or when a starter can become measured', () => {
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh({ kcal: 2500, updatedAt: now - week, source: 'measured' }, now)).toBe(true);
    expect(needsRefresh({ kcal: 2500, updatedAt: now - 2 * 24 * 3600 * 1000, source: 'measured' }, now)).toBe(false);
    expect(needsRefresh({ kcal: 2500, updatedAt: now - 1000, source: 'starter' }, now, true)).toBe(true);
    expect(needsRefresh({ kcal: 2500, updatedAt: now - 1000, source: 'starter' }, now, false)).toBe(false);
  });
});
