import { useLiveQuery } from 'dexie-react-hooks';
import { sleepHours } from '../../../core/adaptation/useDailyTargets';
import { db } from '../../../core/db';
import type { DateKey, Habit, HabitLog, Id, Task, TimeEntry, WorkoutLog } from '../../../core/types';
import { weekStart } from '../../../core/habitSchedule';

/** Raw records of other blocks the «Сегодня» summary reads (read-only). */
export interface SummaryData {
  /** Active tasks due today or earlier. */
  tasks: Task[];
  /** Habits that are not archived. */
  habits: Habit[];
  /** Habit logs of the current week (Monday … today). */
  habitLogs: HabitLog[];
  /** Today's time entries plus timers still running from earlier days. */
  timeEntries: TimeEntry[];
  /** Time category names by id. */
  categories: Record<Id, string>;
  /** Hours slept last night, if logged. */
  sleepHours?: number;
  workouts: WorkoutLog[];
  /** Raw value of `settings` `time.pomodoro.running` (written by «Время»); validate with `parseRunningPomodoro`. */
  pomodoroRunning?: unknown;
}

export async function loadSummaryData(today: DateKey): Promise<SummaryData> {
  const monday = weekStart(today);
  const [tasks, habits, habitLogs, todayEntries, running, categories, sleep, workouts, pomodoro] = await Promise.all([
    db.tasks
      .where('dueDate')
      .belowOrEqual(today)
      .filter((t) => t.completedAt === undefined)
      .toArray(),
    db.habits.filter((h) => !h.archived).toArray(),
    db.habitLogs.where('date').between(monday, today, true, true).toArray(),
    db.timeEntries.where('date').equals(today).toArray(),
    // Any timer without an end is running, however long ago it started (same as the «Время» screen).
    db.timeEntries.filter((e) => e.end === undefined).toArray(),
    db.timeCategories.toArray(),
    db.sleepLogs.where('date').equals(today).first(),
    db.workoutLogs.where('date').equals(today).toArray(),
    db.settings.get('time.pomodoro.running'),
  ]);
  return {
    tasks,
    habits,
    habitLogs,
    timeEntries: [...todayEntries, ...running.filter((e) => e.date !== today)],
    categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    sleepHours: sleep ? sleepHours(sleep) : undefined,
    workouts,
    pomodoroRunning: pomodoro?.value,
  };
}

export function useSummaryData(today: DateKey): SummaryData | undefined {
  return useLiveQuery(() => loadSummaryData(today), [today]);
}
