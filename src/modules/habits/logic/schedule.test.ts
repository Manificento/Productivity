import { describe, expect, it } from 'vitest';
import type { HabitLog } from '../../../core/types';
import { doneDays, isScheduled, isWeekly, weeklyQuota, weekStart } from './schedule';

const log = (date: string, done: boolean, updatedAt = 0): HabitLog => ({
  id: `${date}-${updatedAt}`,
  habitId: 'h',
  date,
  done,
  createdAt: 0,
  updatedAt,
});

describe('isScheduled', () => {
  // 2026-11-02 is a Monday
  const monWedFri = { kind: 'weekdays' as const, weekdays: [1, 3, 5] };

  it('привычка «по пн, ср, пт»: во вторник isScheduled = false', () => {
    expect(isScheduled(monWedFri, '2026-11-03')).toBe(false);
  });

  it('привычка «по пн, ср, пт»: в пн, ср, пт — true, в выходные — false', () => {
    expect(['2026-11-02', '2026-11-04', '2026-11-06'].map((d) => isScheduled(monWedFri, d))).toEqual([
      true,
      true,
      true,
    ]);
    expect(['2026-11-07', '2026-11-08'].map((d) => isScheduled(monWedFri, d))).toEqual([false, false]);
  });

  it('ежедневная и «N раз в неделю» запланированы каждый день; без дней недели — никогда', () => {
    expect(isScheduled({ kind: 'daily' }, '2026-11-03')).toBe(true);
    expect(isScheduled({ kind: 'timesPerWeek', timesPerWeek: 3 }, '2026-11-08')).toBe(true);
    expect(isScheduled({ kind: 'weekdays' }, '2026-11-03')).toBe(false);
  });
});

describe('helpers', () => {
  it('неделя начинается с понедельника', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
  });

  it('последняя отметка дня побеждает', () => {
    const days = doneDays([
      log('2026-11-02', true, 1),
      log('2026-11-02', false, 2),
      log('2026-11-03', false, 1),
      log('2026-11-03', true, 5),
      log('2026-11-04', true),
    ]);
    expect([...days].sort()).toEqual(['2026-11-03', '2026-11-04']);
  });

  it('недельная норма и тип', () => {
    expect(weeklyQuota({ kind: 'timesPerWeek', timesPerWeek: 3 })).toBe(3);
    expect(weeklyQuota({ kind: 'timesPerWeek' })).toBe(1);
    expect(weeklyQuota({ kind: 'timesPerWeek', timesPerWeek: 9 })).toBe(7);
    expect(weeklyQuota({ kind: 'timesPerWeek', timesPerWeek: 2.7 })).toBe(2);
    expect(weeklyQuota({ kind: 'timesPerWeek', timesPerWeek: Number.NaN })).toBe(1);
    expect(weeklyQuota({ kind: 'timesPerWeek', timesPerWeek: 0 })).toBe(1);
    expect(isWeekly({ kind: 'timesPerWeek', timesPerWeek: 3 })).toBe(true);
    expect(isWeekly({ kind: 'daily' })).toBe(false);
  });
});
