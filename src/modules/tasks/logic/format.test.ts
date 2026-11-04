import { describe, expect, it } from 'vitest';
import { dayHeading, dueLabel } from './format';

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
