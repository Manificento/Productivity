import { describe, expect, it } from 'vitest';
import { NATURAL_KEY_TABLES, naturalIdOf, withNaturalIds } from './naturalKeys';

const base = (id: string, updatedAt = 1, createdAt = 1) => ({ id, createdAt, updatedAt });

describe('contract #275: naturalIdOf', () => {
  it('names the record by what identifies it, for each of the five tables', () => {
    expect(NATURAL_KEY_TABLES).toEqual(['checkIns', 'sleepLogs', 'habitLogs', 'mealLogs', 'weightLogs']);
    expect(naturalIdOf('checkIns', { date: '2026-11-05' })).toBe('checkIn:2026-11-05');
    expect(naturalIdOf('sleepLogs', { date: '2026-11-05' })).toBe('sleep:2026-11-05');
    expect(naturalIdOf('habitLogs', { habitId: 'h1', date: '2026-11-05' })).toBe('habitLog:h1:2026-11-05');
    expect(naturalIdOf('mealLogs', { date: '2026-11-05', kind: 'snack' })).toBe('meal:2026-11-05:snack');
    expect(naturalIdOf('weightLogs', { date: '2026-11-05' })).toBe('weight:2026-11-05');
  });

  it('is undefined for a row that lacks its natural key — never throws', () => {
    expect(naturalIdOf('checkIns', {})).toBeUndefined();
    expect(naturalIdOf('sleepLogs', { date: 20261105 })).toBeUndefined();
    expect(naturalIdOf('habitLogs', { date: '2026-11-05' })).toBeUndefined();
    expect(naturalIdOf('mealLogs', { date: '2026-11-05', kind: 'brunch' })).toBeUndefined();
    expect(naturalIdOf('weightLogs', null)).toBeUndefined();
    expect(naturalIdOf('weightLogs', 'строка')).toBeUndefined();
  });
});

describe('contract #275: withNaturalIds — records with random ids move under natural ids', () => {
  it('copies each record under its natural id and changes nothing else', () => {
    const night = { ...base('3f6c', 20, 10), date: '2026-11-05', bedtime: 1, wakeTime: 2, quality: 4, sourceId: 'sc' };
    expect(withNaturalIds('sleepLogs', [night])).toEqual([{ ...night, id: 'sleep:2026-11-05' }]);
    expect(withNaturalIds('checkIns', [{ ...base('a'), date: '2026-11-05', energy: 2, focus: 3 }])).toEqual([
      { ...base('checkIn:2026-11-05'), date: '2026-11-05', energy: 2, focus: 3 },
    ]);
    expect(withNaturalIds('weightLogs', [{ ...base('w'), date: '2026-11-05', kg: 70 }])).toEqual([
      { ...base('weight:2026-11-05'), date: '2026-11-05', kg: 70 },
    ]);
    expect(withNaturalIds('habitLogs', [{ ...base('l'), habitId: 'h1', date: '2026-11-05', done: true }])).toEqual([
      { ...base('habitLog:h1:2026-11-05'), habitId: 'h1', date: '2026-11-05', done: true },
    ]);
  });

  it('several old records of one id: the one with the largest updatedAt stays', () => {
    const log = (id: string, updatedAt: number, done: boolean) => ({
      ...base(id, updatedAt),
      habitId: 'h1',
      date: '2026-11-05',
      done,
    });
    const other = { ...base('z', 9), habitId: 'h2', date: '2026-11-05', done: true };
    expect(withNaturalIds('habitLogs', [log('a', 5, false), log('b', 7, true), other, log('c', 6, false)])).toEqual([
      { ...log('b', 7, true), id: 'habitLog:h1:2026-11-05' },
      { ...other, id: 'habitLog:h2:2026-11-05' },
    ]);
  });

  it('equal updatedAt: the choice does not depend on the order of the rows (two devices agree)', () => {
    const a = { ...base('a', 5), habitId: 'h1', date: '2026-11-05', done: false };
    const b = { ...base('b', 5), habitId: 'h1', date: '2026-11-05', done: true };
    expect(withNaturalIds('habitLogs', [a, b])).toEqual(withNaturalIds('habitLogs', [b, a]));
    // The later id wins — the same tie-break `toggleHabit` and `doneDays` use for duplicates.
    expect(withNaturalIds('habitLogs', [b, a])).toEqual([{ ...b, id: 'habitLog:h1:2026-11-05' }]);
  });

  it('a row without its natural key stays as it is, under its old id', () => {
    const odd = { ...base('odd'), date: 'вчера', energy: 3, focus: 3 };
    const good = { ...base('x'), date: '2026-11-05', energy: 3, focus: 3 };
    expect(withNaturalIds('checkIns', [odd, good, 'мусор', null])).toEqual([
      odd,
      { ...good, id: 'checkIn:2026-11-05' },
      'мусор',
      null,
    ]);
  });

  it('is idempotent: migrated rows come back unchanged', () => {
    const rows = [
      { ...base('a', 5), date: '2026-11-05', time: 1, kind: 'lunch', items: [{ foodId: 'f1', grams: 100 }] },
      { ...base('b', 7), date: '2026-11-05', time: 2, kind: 'lunch', items: [{ foodId: 'f2', grams: 50 }] },
      { ...base('c', 3), date: '2026-11-06', time: 3, kind: 'dinner', items: [] },
    ];
    const once = withNaturalIds('mealLogs', rows);
    expect(withNaturalIds('mealLogs', once)).toEqual(once);
    expect(withNaturalIds('mealLogs', withNaturalIds('mealLogs', once))).toEqual(once);
  });
});

describe('contract #275: withNaturalIds — mealLogs', () => {
  const meal = (id: string, updatedAt: number, items: unknown[], extra: object = {}) => ({
    ...base(id, updatedAt, updatedAt),
    date: '2026-11-05',
    time: updatedAt,
    kind: 'lunch',
    items,
    ...extra,
  });

  it('старые элементы без id получают его: id и updatedAt у каждого элемента', () => {
    const [migrated] = withNaturalIds('mealLogs', [
      meal('7c9e', 40, [
        { foodId: 'f1', grams: 150 },
        { foodId: 'f2', grams: 50 },
      ]),
    ]);
    expect(migrated).toEqual({
      ...meal('meal:2026-11-05:lunch', 40, []),
      items: [
        { id: '7c9e:0', foodId: 'f1', grams: 150, updatedAt: 40 },
        { id: '7c9e:1', foodId: 'f2', grams: 50, updatedAt: 40 },
      ],
    });
  });

  it('item ids come from the old record, not from chance: two devices holding the same backup get the same ids', () => {
    const rows = [meal('7c9e', 40, [{ foodId: 'f1', grams: 150 }])];
    expect(withNaturalIds('mealLogs', rows)).toEqual(withNaturalIds('mealLogs', structuredClone(rows)));
  });

  it('several old meals of one id: the latest record stays and the items of all of them are united', () => {
    const [merged, dinner] = withNaturalIds('mealLogs', [
      meal('b', 70, [{ foodId: 'f3', grams: 30 }]),
      meal('a', 50, [
        { foodId: 'f1', grams: 150 },
        { foodId: 'f2', grams: 50 },
      ]),
      meal('d', 60, [{ foodId: 'f9', grams: 10 }], { kind: 'dinner' }),
    ]);
    expect(merged).toEqual({
      // The fields of the record changed last…
      ...meal('meal:2026-11-05:lunch', 70, []),
      // …and every item of every old record, older records first (later items of a meal are newer).
      items: [
        { id: 'a:0', foodId: 'f1', grams: 150, updatedAt: 50 },
        { id: 'a:1', foodId: 'f2', grams: 50, updatedAt: 50 },
        { id: 'b:0', foodId: 'f3', grams: 30, updatedAt: 70 },
      ],
    });
    expect(dinner).toMatchObject({ id: 'meal:2026-11-05:dinner', items: [{ id: 'd:0', foodId: 'f9' }] });
  });

  it('the same item in two records (same id) is kept once — the later edit of it', () => {
    const [merged] = withNaturalIds('mealLogs', [
      meal('meal:2026-11-05:lunch', 50, [
        { id: 'i1', foodId: 'f1', grams: 150, updatedAt: 50 },
        { id: 'i2', foodId: 'f2', grams: 50, updatedAt: 20 },
      ]),
      meal('copy', 60, [
        { id: 'i1', foodId: 'f1', grams: 100, updatedAt: 40 },
        { id: 'i2', foodId: 'f2', grams: 80, updatedAt: 60 },
      ]),
    ]);
    expect((merged as { items: unknown[] }).items).toEqual([
      { id: 'i1', foodId: 'f1', grams: 150, updatedAt: 50 },
      { id: 'i2', foodId: 'f2', grams: 80, updatedAt: 60 },
    ]);
  });

  it('an item that already has an id keeps it; odd items and a meal without a list do not break the migration', () => {
    const [kept, noList] = withNaturalIds('mealLogs', [
      meal('m', 40, [{ id: 'own', foodId: 'f1', grams: 1, updatedAt: 7 }, 'мусор', { foodId: 'f2', grams: 2 }]),
      { ...base('n'), date: '2026-11-06', kind: 'snack' },
    ]);
    expect((kept as { items: unknown[] }).items).toEqual([
      { id: 'own', foodId: 'f1', grams: 1, updatedAt: 7 },
      'мусор',
      { id: 'm:2', foodId: 'f2', grams: 2, updatedAt: 40 },
    ]);
    expect(noList).toEqual({ ...base('meal:2026-11-06:snack'), date: '2026-11-06', kind: 'snack' });
  });
});
