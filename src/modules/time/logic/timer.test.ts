import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { DEFAULT_CATEGORY_NAMES, formatDuration, parseManualEntry } from './timer';

describe('DEFAULT_CATEGORY_NAMES', () => {
  it('стартовый набор: Учёба, Работа, Спорт, Отдых, Быт', () => {
    expect(DEFAULT_CATEGORY_NAMES).toEqual(['Учёба', 'Работа', 'Спорт', 'Отдых', 'Быт']);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [59_999, '00:59'],
    [5 * 60_000 + 7_000, '05:07'],
    [3_600_000 + 2 * 60_000 + 3_000, '1:02:03'],
    [26 * 3_600_000, '26:00:00'],
    [-5_000, '00:00'],
  ])('%i мс → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('parseManualEntry', () => {
  it('категория, начало и конец → запись с днём начала', () => {
    expect(parseManualEntry({ categoryId: 'c1', start: '2026-11-02T23:30', end: '2026-11-03T00:30' })).toEqual({
      ok: true,
      value: {
        categoryId: 'c1',
        start: atLocalTime('2026-11-02', '23:30'),
        end: atLocalTime('2026-11-03', '00:30'),
        date: '2026-11-02',
      },
    });
  });

  it('конец раньше начала — ошибка', () => {
    expect(parseManualEntry({ categoryId: 'c1', start: '2026-11-02T10:00', end: '2026-11-02T09:00' })).toEqual({
      ok: false,
      field: 'end',
      error: 'Конец должен быть позже начала',
    });
  });

  it('конец равен началу — ошибка', () => {
    const r = parseManualEntry({ categoryId: 'c1', start: '2026-11-02T10:00', end: '2026-11-02T10:00' });
    expect(r.ok).toBe(false);
  });

  it('без категории — ошибка', () => {
    expect(parseManualEntry({ categoryId: '', start: '2026-11-02T10:00', end: '2026-11-02T11:00' })).toEqual({
      ok: false,
      field: 'categoryId',
      error: 'Выберите категорию',
    });
  });

  it('пустое или неверное время — ошибка', () => {
    expect(parseManualEntry({ categoryId: 'c1', start: '', end: '2026-11-02T11:00' })).toEqual({
      ok: false,
      field: 'start',
      error: 'Укажите начало',
    });
    expect(parseManualEntry({ categoryId: 'c1', start: '2026-11-02T10:00', end: 'вчера' })).toEqual({
      ok: false,
      field: 'end',
      error: 'Укажите конец',
    });
  });
});
