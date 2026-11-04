import { describe, expect, it } from 'vitest';
import { dayHeading, dueLabel, estimateLabel, previewChips, recurrenceLabel } from './format';

const TODAY = '2026-11-04'; // Wednesday

describe('format', () => {
  it('labels nearby days in words and others by date', () => {
    expect(dueLabel('2026-11-03', TODAY)).toBe('Вчера');
    expect(dueLabel('2026-11-04', TODAY)).toBe('Сегодня');
    expect(dueLabel('2026-11-05', TODAY)).toBe('Завтра');
    expect(dueLabel('2026-11-12', TODAY)).toBe('12 нояб.');
  });

  it('appends the due time', () => {
    expect(dueLabel('2026-11-05', TODAY, '09:00')).toBe('Завтра 09:00');
  });

  it('shows the year only for another year', () => {
    expect(dueLabel('2027-01-02', TODAY)).toBe('2 янв. 2027');
  });

  it('builds an upcoming day heading with the weekday', () => {
    expect(dayHeading('2026-11-05', TODAY)).toBe('Завтра · чт, 5 нояб.');
    expect(dayHeading('2026-11-09', TODAY)).toBe('пн, 9 нояб.');
  });
});

describe('quick add preview', () => {
  it('Given я печатаю «завтра 9:00 позвонить #учёба !1» When текст меняется Then под полем появляются чипы: «Завтра 09:00», «#учёба», «P1»', () => {
    expect(
      previewChips(
        { title: 'позвонить', dueDate: '2026-11-05', dueTime: '09:00', projectName: 'учёба', priority: 1, tags: [] },
        TODAY,
      ),
    ).toEqual(['Завтра 09:00', '#учёба', 'P1']);
  });

  it('shows tags, estimate and repeat too', () => {
    expect(
      previewChips(
        {
          title: 'зарядка',
          dueDate: TODAY,
          tags: ['утро'],
          estimateMin: 90,
          recurrence: { kind: 'weekly', weekdays: [1, 3] },
        },
        TODAY,
      ),
    ).toEqual(['Сегодня', '@утро', '~1 ч 30 мин', '↻ по пн, ср']);
  });

  it('shows nothing for a plain title (the default P4 included)', () => {
    expect(previewChips({ title: 'купить молоко', tags: [] }, TODAY)).toEqual([]);
    expect(previewChips({ title: 'купить молоко', priority: 4, tags: [] }, TODAY)).toEqual([]);
  });

  it.each([
    [{ kind: 'daily' as const }, 'каждый день'],
    [{ kind: 'weekly' as const, weekdays: [1, 2, 3, 4, 5] }, 'по будням'],
    [{ kind: 'weekly' as const }, 'каждую неделю'],
    [{ kind: 'monthly' as const }, 'каждый месяц'],
    [{ kind: 'everyNDays' as const, interval: 3 }, 'каждые 3 дн.'],
  ])('labels repeats: %j → %s', (r, label) => {
    expect(recurrenceLabel(r)).toBe(label);
  });

  it.each([
    [30, '~30 мин'],
    [60, '~1 ч'],
  ])('labels estimates: %i → %s', (min, label) => {
    expect(estimateLabel(min)).toBe(label);
  });
});
