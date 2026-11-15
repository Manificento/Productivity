import { describe, expect, it } from 'vitest';
import { naturalId, newRecord } from './ids';

describe('contract #275: naturalId', () => {
  it('Given src/core/ids.ts When читаю Then есть naturalId(kind, ...parts): checkIn:<DateKey>, sleep:<DateKey>, habitLog:<habitId>:<DateKey>, meal:<DateKey>:<kind>, weight:<DateKey>; чистая функция с тестами', () => {
    expect(naturalId('checkIn', '2026-11-05')).toBe('checkIn:2026-11-05');
    expect(naturalId('sleep', '2026-11-05')).toBe('sleep:2026-11-05');
    expect(naturalId('habitLog', 'h-1', '2026-11-05')).toBe('habitLog:h-1:2026-11-05');
    expect(naturalId('meal', '2026-11-05', 'lunch')).toBe('meal:2026-11-05:lunch');
    expect(naturalId('weight', '2026-11-05')).toBe('weight:2026-11-05');
  });

  it('is pure: the same parts always give the same id, on any device and at any time', () => {
    expect(naturalId('habitLog', 'b6c1…', '2026-01-31')).toBe(naturalId('habitLog', 'b6c1…', '2026-01-31'));
    expect(naturalId('meal', '2026-01-31', 'snack')).not.toBe(naturalId('meal', '2026-01-31', 'dinner'));
    expect(naturalId('sleep', '2026-01-31')).not.toBe(naturalId('weight', '2026-01-31'));
  });

  it('refuses parts that would make an id shared by unrelated records', () => {
    // A day is always a DateKey — a timestamp or a UTC string here would split one day into two records.
    expect(() => naturalId('sleep', '2026-11-5')).toThrow(/DateKey/);
    expect(() => naturalId('checkIn', '')).toThrow(/DateKey/);
    expect(() => naturalId('weight', '2026-11-05T00:00:00.000Z')).toThrow(/DateKey/);
    // @ts-expect-error — the part is missing on purpose
    expect(() => naturalId('habitLog', 'h-1')).toThrow(/DateKey/);
    expect(() => naturalId('habitLog', '', '2026-11-05')).toThrow(/habitId/);
    // @ts-expect-error — not a meal kind
    expect(() => naturalId('meal', '2026-11-05', 'brunch')).toThrow(/kind/);
  });
});

describe('newRecord', () => {
  it('fills a random id and both times; a given id (naturalId) is used as is', () => {
    const random = newRecord({ kg: 70 }, 5);
    expect(random).toMatchObject({ kg: 70, createdAt: 5, updatedAt: 5 });
    expect(random.id).toMatch(/\S/);
    expect(newRecord({ kg: 70 }, 5).id).not.toBe(random.id);

    expect(newRecord({ date: '2026-11-05', kg: 70 }, 5, naturalId('weight', '2026-11-05'))).toEqual({
      id: 'weight:2026-11-05',
      date: '2026-11-05',
      kg: 70,
      createdAt: 5,
      updatedAt: 5,
    });
  });
});
