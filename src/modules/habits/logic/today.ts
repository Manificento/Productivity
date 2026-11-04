import { toDateKey } from '../../../core/dates';
import type { DateKey, Habit, HabitLog } from '../../../core/types';
import { doneDays, isScheduled } from './schedule';
import { streak, type Streak } from './streaks';

export interface TodayHabit {
  habit: Habit;
  done: boolean;
  streak: Streak;
}

/**
 * Active habits planned for `today` with today's mark and streak, in creation order.
 * `other` are active habits not planned today (e.g. «пн, ср, пт» on a Tuesday).
 */
export function todayHabits(
  habits: readonly Habit[],
  logs: readonly HabitLog[],
  today: DateKey,
): { items: TodayHabit[]; other: Habit[] } {
  const byHabit = new Map<string, HabitLog[]>();
  for (const log of logs) {
    const list = byHabit.get(log.habitId);
    if (list) list.push(log);
    else byHabit.set(log.habitId, [log]);
  }
  const active = habits.filter((h) => !h.archived).sort((a, b) => a.createdAt - b.createdAt);
  const planned = active.filter((h) => isScheduled(h.schedule, today));
  const items = planned.map((habit) => {
    const own = byHabit.get(habit.id) ?? [];
    return {
      habit,
      done: doneDays(own).has(today),
      streak: streak({ schedule: habit.schedule, logs: own, since: toDateKey(habit.createdAt) }, today),
    };
  });
  return { items, other: active.filter((h) => !isScheduled(h.schedule, today)) };
}

/** «🔥5» for days, «🔥2 нед.» for weekly habits. */
export function streakLabel(s: Streak): string {
  return s.unit === 'weeks' ? `🔥${s.current} нед.` : `🔥${s.current}`;
}
