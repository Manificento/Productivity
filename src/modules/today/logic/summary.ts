import { startOfWeek } from 'date-fns';
import type { Phase } from '../../../core/adaptation/types';
import { daysBetween, fromDateKey, toDateKey } from '../../../core/dates';
import type { DateKey, Habit, HabitLog, Id, LifeEvent, Task, TimeEntry } from '../../../core/types';
import { daysLabel } from './events';

/**
 * Pure read-models for the «Сегодня» summary. They read other modules' records (never write them)
 * and keep only the small rules the summary needs, because modules must not import each other.
 */

export const PHASE_NAME: Record<Exclude<Phase, 'normal'>, string> = {
  prep: 'Подготовка',
  taper: 'Разгрузка',
  event: 'День события',
  recovery: 'Восстановление',
};

/** «IELTS через 3 дня · Подготовка». */
export function eventBanner(event: LifeEvent, phase: Exclude<Phase, 'normal'>, today: DateKey): string {
  return `${event.title} ${daysLabel(daysBetween(today, event.date))} · ${PHASE_NAME[phase]}`;
}

export interface TasksSummary {
  /** Sum of estimates of active tasks due today or earlier, minutes. */
  plannedMin: number;
  count: number;
  /** Up to three tasks to start with: the focus project first, then overdue, priority, time. */
  top: Task[];
}

export function tasksSummary(tasks: Task[], today: DateKey, focusProjectId: Id | undefined): TasksSummary {
  const due = tasks.filter((t) => t.completedAt === undefined && t.dueDate !== undefined && t.dueDate <= today);
  const rank = (t: Task) => [
    focusProjectId !== undefined && t.projectId === focusProjectId ? 0 : 1,
    t.dueDate! < today ? 0 : 1,
    t.priority,
  ];
  const sorted = [...due].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || a.createdAt - b.createdAt;
  });
  return {
    plannedMin: due.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0),
    count: due.length,
    top: sorted.slice(0, 3),
  };
}

/** Monday of the week that contains `day`. */
function weekStart(day: DateKey): DateKey {
  return toDateKey(startOfWeek(fromDateKey(day), { weekStartsOn: 1 }));
}

function isDueToday(habit: Habit, logs: HabitLog[], today: DateKey): boolean {
  const s = habit.schedule;
  if (s.kind === 'daily') return true;
  if (s.kind === 'weekdays') return (s.weekdays ?? []).includes(fromDateKey(today).getDay());
  // timesPerWeek: still due while the weekly goal is not reached; a habit done today stays in the count.
  const monday = weekStart(today);
  const doneThisWeek = logs.filter((l) => l.habitId === habit.id && l.done && l.date >= monday && l.date <= today);
  return doneThisWeek.some((l) => l.date === today) || doneThisWeek.length < (s.timesPerWeek ?? 1);
}

/** «Привычки: done из total» for habits scheduled today. `logs` should cover the current week. */
export function habitsSummary(habits: Habit[], logs: HabitLog[], today: DateKey): { done: number; total: number } {
  const due = habits.filter((h) => !h.archived && isDueToday(h, logs, today));
  const doneToday = new Set(logs.filter((l) => l.date === today && l.done).map((l) => l.habitId));
  return { done: due.filter((h) => doneToday.has(h.id)).length, total: due.length };
}

/** Focus sessions finished today (Pomodoro entries) and the running timer, if any. */
export function focusSummary(entries: TimeEntry[], today: DateKey): { sessions: number; running?: TimeEntry } {
  return {
    sessions: entries.filter((e) => e.source === 'pomodoro' && e.date === today && e.end !== undefined).length,
    running: entries.find((e) => e.end === undefined),
  };
}
