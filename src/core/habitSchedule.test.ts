import { describe, expect, it } from 'vitest';
import { doneDays, isDue, isScheduled, isWeekly, weeklyQuota, weekStart } from './habitSchedule';
import type { HabitLog, HabitSchedule } from './types';

const log = (date: string, done = true, updatedAt = 0): HabitLog => ({
  id: `${date}-${updatedAt}`,
  habitId: 'h',
  date,
  done,
  createdAt: 0,
  updatedAt,
});

// 2026-11-02 is a Monday; 2026-11-04 is a Wednesday.
const today = '2026-11-04';

describe('isScheduled', () => {
  const monWedFri: HabitSchedule = { kind: 'weekdays', weekdays: [1, 3, 5] };

  it('привычка «по пн, ср, пт»: в пн, ср, пт — true, во вторник и в выходные — false', () => {
    expect(['2026-11-02', '2026-11-04', '2026-11-06'].map((d) => isScheduled(monWedFri, d))).toEqual([
      true,
      true,
      true,
    ]);
    expect(['2026-11-03', '2026-11-07', '2026-11-08'].map((d) => isScheduled(monWedFri, d))).toEqual([
      false,
      false,
      false,
    ]);
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

  it('недельная норма — целое 1…7, тип — недельный только для «N раз в неделю»', () => {
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

describe('isDue', () => {
  it('Given правило «привычка запланирована на день» When оно в src/core Then daily — всегда, weekdays — по дням недели', () => {
    expect(isDue({ kind: 'daily' }, [], today)).toBe(true);
    expect(isDue({ kind: 'weekdays', weekdays: [3] }, [], today)).toBe(true);
    expect(isDue({ kind: 'weekdays', weekdays: [1, 5] }, [], today)).toBe(false);
  });

  it('Given привычка timesPerWeek уже выполнила недельную цель When считается день Then она не запланирована, если не отмечена сегодня', () => {
    const twice: HabitSchedule = { kind: 'timesPerWeek', timesPerWeek: 2 };
    // Goal not met yet: still due.
    expect(isDue(twice, [log('2026-11-02')], today)).toBe(true);
    // Goal met on Monday and Tuesday: not due on Wednesday.
    expect(isDue(twice, [log('2026-11-02'), log('2026-11-03')], today)).toBe(false);
    // Done today: stays due (counted as done today), even when that completes the goal.
    expect(isDue(twice, [log('2026-11-02'), log(today)], today)).toBe(true);
    expect(isDue(twice, [log('2026-11-02'), log('2026-11-03'), log(today)], today)).toBe(true);
  });

  it('timesPerWeek: прошлая неделя, будущие дни и снятые отметки не засчитываются в цель', () => {
    const twice: HabitSchedule = { kind: 'timesPerWeek', timesPerWeek: 2 };
    expect(isDue(twice, [log('2026-10-31'), log('2026-11-01')], today)).toBe(true);
    expect(isDue(twice, [log('2026-11-02'), log('2026-11-06')], today)).toBe(true);
    expect(isDue(twice, [log('2026-11-02'), log('2026-11-03', true, 1), log('2026-11-03', false, 2)], today)).toBe(
      true,
    );
  });
});
