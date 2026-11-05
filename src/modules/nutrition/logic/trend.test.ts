import { describe, expect, it } from 'vitest';
import type { DateKey } from '../../../core/types';
import { TREND_MIN_ENTRIES, formatKg, parseKg, trendSeries, validateKg, weeklyChange } from './trend';

const day = (n: number): DateKey => `2026-10-${String(n).padStart(2, '0')}`;
const entries = (kgs: number[]) => kgs.map((kg, i) => ({ date: day(i + 1), kg }));

describe('weight parsing', () => {
  it('Given ввод «72,4» When разбираю Then 72.4 (запятая и точка)', () => {
    expect(parseKg('72,4')).toBe(72.4);
    expect(parseKg(' 72.4 ')).toBe(72.4);
  });
  it('Given пустой или нечисловой ввод When разбираю Then undefined', () => {
    expect(parseKg('')).toBeUndefined();
    expect(parseKg('abc')).toBeUndefined();
  });
  it('Given ввод 0 или 400 When проверяю Then ошибка валидации', () => {
    expect(validateKg(0)).toMatch(/кг/);
    expect(validateKg(400)).toMatch(/кг/);
    expect(validateKg(undefined)).toMatch(/кг/);
    expect(validateKg(72.4)).toBeUndefined();
  });
  it('formats kilograms with a decimal comma', () => {
    expect(formatKg(72.4)).toBe('72,4');
    expect(formatKg(72)).toBe('72');
  });
});

describe('trend', () => {
  it('Given постоянный вес When считаю тренд Then тренд равен весу', () => {
    const t = trendSeries(entries([70, 70, 70, 70]));
    expect(t.map((p) => p.trend)).toEqual([70, 70, 70, 70]);
  });

  it('Given шум вокруг 70 When считаю тренд Then тренд гладче точек', () => {
    const kgs = [70, 72, 68, 72, 68, 72, 68, 72, 68, 72, 68, 72, 68, 72];
    const t = trendSeries(entries(kgs));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(t.slice(5).map((p) => p.trend))).toBeLessThan(spread(kgs.slice(5)) / 2);
  });

  it('Given первая запись When считаю тренд Then он начинается с неё (экспоненциальное сглаживание)', () => {
    const t = trendSeries(entries([80, 90]));
    expect(t[0]!.trend).toBe(80);
    expect(t[1]!.trend).toBeGreaterThan(80);
    expect(t[1]!.trend).toBeLessThan(90);
  });

  it('Given записи вразнобой When считаю тренд Then порядок по дате', () => {
    const t = trendSeries([
      { date: day(3), kg: 70 },
      { date: day(1), kg: 70 },
    ]);
    expect(t.map((p) => p.date)).toEqual([day(1), day(3)]);
  });
});

describe('weekly change', () => {
  it('Given тренд снижается на 0,1 кг в день When считаю неделю Then −0,7', () => {
    const kgs = Array.from({ length: 15 }, (_, i) => 80 - i * 0.1);
    const series = trendSeries(entries(kgs)).map((p) => ({ ...p, trend: p.kg }));
    expect(weeklyChange(series)).toBeCloseTo(-0.7, 5);
  });
  it('Given записей меньше недели When считаю Then undefined', () => {
    expect(weeklyChange(trendSeries(entries([70, 70, 70])))).toBeUndefined();
  });
  it('shows the trend from 14 entries', () => {
    expect(TREND_MIN_ENTRIES).toBe(14);
  });
});
