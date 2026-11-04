import { describe, expect, it } from 'vitest';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { Habit, HabitLog } from '../../../core/types';
import { streakLabel, todayHabits } from './today';

const TODAY = '2026-11-03'; // Tuesday
const created = atLocalTime('2026-10-01', '09:00');

const habit = (id: string, over: Partial<Habit> = {}): Habit => ({
  id,
  name: id,
  schedule: { kind: 'daily' },
  archived: false,
  createdAt: created,
  updatedAt: created,
  ...over,
});
const log = (habitId: string, date: string, done = true): HabitLog => ({
  id: `${habitId}-${date}`,
  habitId,
  date,
  done,
  createdAt: 0,
  updatedAt: 0,
});

describe('todayHabits', () => {
  it('есть привычки, запланированные на сегодня: видны с отметкой и серией', () => {
    const habits = [
      habit('run', { createdAt: created + 1 }),
      habit('read'),
      habit('gym', { schedule: { kind: 'weekdays', weekdays: [1, 3, 5] } }), // not on Tuesday
      habit('old', { archived: true }),
    ];
    const logs = [log('read', '2026-11-01'), log('read', '2026-11-02'), log('read', TODAY), log('run', '2026-11-02')];
    const { items, other } = todayHabits(habits, logs, TODAY);

    expect(items.map((i) => [i.habit.id, i.done, i.streak.current])).toEqual([
      ['read', true, 3],
      ['run', false, 1],
    ]);
    expect(other.map((h) => h.id)).toEqual(['gym']);
  });

  it('снятая отметка сегодня — не выполнено, серия не обнуляется', () => {
    const { items } = todayHabits([habit('read')], [log('read', '2026-11-02'), log('read', TODAY, false)], TODAY);
    expect(items[0]).toMatchObject({ done: false, streak: { current: 1 } });
  });
});

describe('streakLabel', () => {
  it('серия в днях и в неделях', () => {
    expect(streakLabel({ current: 5, best: 5, unit: 'days' })).toBe('🔥5');
    expect(streakLabel({ current: 2, best: 3, unit: 'weeks' })).toBe('🔥2 нед.');
  });
});
