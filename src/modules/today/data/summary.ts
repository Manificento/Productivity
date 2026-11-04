import { startOfWeek } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { sleepHours } from '../../../core/adaptation/useDailyTargets';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import type { DateKey, Habit, HabitLog, Id, Task, TimeEntry, WorkoutLog } from '../../../core/types';

/** Raw records of other blocks the «Сегодня» summary reads (read-only). */
export interface SummaryData {
  /** Active tasks due today or earlier. */
  tasks: Task[];
  /** Habits that are not archived. */
  habits: Habit[];
  /** Habit logs of the current week (Monday … today). */
  habitLogs: HabitLog[];
  /** Today's time entries plus a timer still running from an earlier day. */
  timeEntries: TimeEntry[];
  /** Time category names by id. */
  categories: Record<Id, string>;
  /** Hours slept last night, if logged. */
  sleepHours?: number;
  workouts: WorkoutLog[];
}

export async function loadSummaryData(today: DateKey): Promise<SummaryData> {
  const monday = toDateKey(startOfWeek(fromDateKey(today), { weekStartsOn: 1 }));
  const [tasks, habits, habitLogs, recentEntries, categories, sleep, workouts] = await Promise.all([
    db.tasks
      .where('dueDate')
      .belowOrEqual(today)
      .filter((t) => t.completedAt === undefined)
      .toArray(),
    db.habits.filter((h) => !h.archived).toArray(),
    db.habitLogs.where('date').between(monday, today, true, true).toArray(),
    db.timeEntries.where('date').between(shiftDateKey(today, -2), today, true, true).toArray(),
    db.timeCategories.toArray(),
    db.sleepLogs.where('date').equals(today).first(),
    db.workoutLogs.where('date').equals(today).toArray(),
  ]);
  return {
    tasks,
    habits,
    habitLogs,
    timeEntries: recentEntries.filter((e) => e.date === today || e.end === undefined),
    categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    sleepHours: sleep ? sleepHours(sleep) : undefined,
    workouts,
  };
}

export function useSummaryData(today: DateKey): SummaryData | undefined {
  return useLiveQuery(() => loadSummaryData(today), [today]);
}
