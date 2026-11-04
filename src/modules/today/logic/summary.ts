import type { Phase } from '../../../core/adaptation/types';
import { daysBetween } from '../../../core/dates';
import { doneDays, isDue } from '../../../core/habitSchedule';
import type { DateKey, Habit, HabitLog, Id, LifeEvent, Task, TimeEntry, WorkoutLog } from '../../../core/types';
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
    return (
      a.dueDate!.localeCompare(b.dueDate!) ||
      (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
      a.createdAt - b.createdAt
    );
  });
  return {
    plannedMin: due.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0),
    count: due.length,
    top: sorted.slice(0, 3),
  };
}

/** «Привычки: done из total» for habits scheduled today. `logs` should cover the current week. */
export function habitsSummary(habits: Habit[], logs: HabitLog[], today: DateKey): { done: number; total: number } {
  // Same rule as the «Привычки» screen: the shared `isDue` from src/core.
  const byHabit = new Map<string, HabitLog[]>();
  for (const l of logs) byHabit.set(l.habitId, [...(byHabit.get(l.habitId) ?? []), l]);
  const own = (h: Habit) => byHabit.get(h.id) ?? [];
  const due = habits.filter((h) => !h.archived && isDue(h.schedule, own(h), today));
  return { done: due.filter((h) => doneDays(own(h)).has(today)).length, total: due.length };
}

/** Focus sessions finished today (Pomodoro entries) and the running timer, if any. */
export function focusSummary(entries: TimeEntry[], today: DateKey): { sessions: number; running?: TimeEntry } {
  return {
    sessions: entries.filter((e) => e.source === 'pomodoro' && e.date === today && e.end !== undefined).length,
    // The latest running timer, like the «Время» screen shows.
    running: entries.filter((e) => e.end === undefined).sort((a, b) => b.start - a.start)[0],
  };
}

export interface WorkoutSummary {
  types: string[];
  minutes: number;
  maxRpe: number;
}

/** Today's workouts in one line; undefined when there were none. */
export function workoutSummary(workouts: WorkoutLog[]): WorkoutSummary | undefined {
  if (workouts.length === 0) return undefined;
  return {
    types: workouts.map((w) => w.type),
    minutes: workouts.reduce((sum, w) => sum + w.durationMin, 0),
    maxRpe: Math.max(...workouts.map((w) => w.rpe)),
  };
}

export type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak';

/** The running Pomodoro phase mirrored by the «Время» module in `settings` (`time.pomodoro.running`). */
export interface RunningPomodoro {
  phase: PomodoroPhase;
  startedAt: number;
  endsAt: number;
}

export const POMODORO_PHASE_LABEL: Record<PomodoroPhase, string> = {
  work: 'фокус',
  shortBreak: 'короткий перерыв',
  longBreak: 'длинный перерыв',
};

/** Validates the setting value; a phase whose `endsAt` has passed is not running (the app may have been closed). */
export function parseRunningPomodoro(value: unknown, now: number): RunningPomodoro | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const { phase, startedAt, endsAt } = v;
  if (phase !== 'work' && phase !== 'shortBreak' && phase !== 'longBreak') return undefined;
  if (typeof startedAt !== 'number' || typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return undefined;
  return endsAt > now ? { phase, startedAt, endsAt } : undefined;
}

/** Time left as «м:сс» (rounded up to a second). */
export function pomodoroLeft(endsAt: number, now: number): string {
  const sec = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
