import { toDateKey, shiftDateKey } from '../../../core/dates';
import type { DateKey, Habit, HabitLog } from '../../../core/types';
import { doneDays, isScheduled, isWeekly, weekStart } from './schedule';
import { completionRate, streak, type HabitHistory, type Streak } from './streaks';

/**
 * - done: marked done
 * - missed: a scheduled day that passed without a mark (daily / weekday habits)
 * - open: can still be done (today), or a free day of a «N раз в неделю» habit
 * - off: not scheduled (weekday habits), or before the habit existed
 * - future: after today — cannot be marked
 */
export type CellStatus = 'done' | 'missed' | 'open' | 'off' | 'future';

export interface CalendarCell {
  date: DateKey;
  status: CellStatus;
}

/** Mon–Sun rows for the last `weeks` weeks, the current week last. */
export function calendarGrid(h: HabitHistory, today: DateKey, weeks = 5): CalendarCell[][] {
  const done = doneDays(h.logs);
  const firstMonday = shiftDateKey(weekStart(today), -7 * (weeks - 1));
  const weekly = isWeekly(h.schedule);
  const since = [...done].reduce((min, d) => (d < min ? d : min), h.since);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = shiftDateKey(firstMonday, w * 7 + i);
      let status: CellStatus;
      if (date > today) status = 'future';
      else if (done.has(date)) status = 'done';
      else if (date < since || !isScheduled(h.schedule, date)) status = 'off';
      else if (date === today || weekly) status = 'open';
      else status = 'missed';
      return { date, status };
    }),
  );
}

export interface HabitStats {
  streak: Streak;
  rate7: number;
  rate30: number;
}

export function habitHistory(habit: Habit, logs: readonly HabitLog[]): HabitHistory {
  return {
    schedule: habit.schedule,
    logs: logs.filter((l) => l.habitId === habit.id),
    since: toDateKey(habit.createdAt),
  };
}

export function habitStats(h: HabitHistory, today: DateKey): HabitStats {
  return { streak: streak(h, today), rate7: completionRate(h, today, 7), rate30: completionRate(h, today, 30) };
}

const STATUS_LABEL: Record<CellStatus, string> = {
  done: 'выполнено',
  missed: 'пропущено',
  open: 'не отмечено',
  off: 'не запланировано',
  future: 'впереди',
};

export function cellStatusLabel(status: CellStatus): string {
  return STATUS_LABEL[status];
}
