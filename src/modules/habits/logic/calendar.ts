import { toDateKey, shiftDateKey } from '../../../core/dates';
import type { DateKey, Habit, HabitLog } from '../../../core/types';
import { isScheduled, isWeekly, weeklyQuota, weekStart } from '../../../core/habitSchedule';
import { completionRate, doneInWeek, prepare, streak, type HabitHistory, type Streak } from './streaks';

/**
 * - done: marked done
 * - missed: a scheduled day that passed without a mark; for «N раз в неделю» — unmarked days of a
 *   finished week that missed its quota (the week the streak counts as missed)
 * - open: can still be done (today; unmarked days of the current week or of a week whose quota is met)
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
  const { done, since } = prepare(h, today);
  const currentWeek = weekStart(today);
  const firstMonday = shiftDateKey(currentWeek, -7 * (weeks - 1));
  const weekly = isWeekly(h.schedule);
  const quota = weeklyQuota(h.schedule);
  return Array.from({ length: weeks }, (_, w) => {
    const monday = shiftDateKey(firstMonday, w * 7);
    const weekOpen = weekly && (monday === currentWeek || doneInWeek(done, monday) >= quota);
    return Array.from({ length: 7 }, (_, i) => {
      const date = shiftDateKey(monday, i);
      let status: CellStatus;
      if (date > today) status = 'future';
      else if (done.has(date)) status = 'done';
      else if (date < since || !isScheduled(h.schedule, date)) status = 'off';
      else if (date === today || weekOpen) status = 'open';
      else status = 'missed';
      return { date, status };
    });
  });
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

/** Text colour that stays readable on a habit colour (WCAG relative luminance). */
export function textOn(hex: string): '#ffffff' | '#18181b' {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  // contrast with white vs. with near-black: pick the larger
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0535 ? '#ffffff' : '#18181b';
}

export function cellStatusLabel(status: CellStatus): string {
  return STATUS_LABEL[status];
}
