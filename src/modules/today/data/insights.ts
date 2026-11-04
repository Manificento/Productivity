import { useLiveQuery } from 'dexie-react-hooks';
import { sleepHours } from '../../../core/adaptation/useDailyTargets';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import type { DateKey } from '../../../core/types';
import type { InsightInput } from '../logic/insights';

/** Days of history the insights look at. */
export const INSIGHT_WINDOW_DAYS = 60;

function add(map: Record<DateKey, number>, day: DateKey, value: number) {
  map[day] = (map[day] ?? 0) + value;
}

/** Reads sleep, tasks, focus, workouts and check-ins of the last 60 days (read-only). */
export async function loadInsightInput(today: DateKey): Promise<InsightInput> {
  const from = shiftDateKey(today, -INSIGHT_WINDOW_DAYS);
  const [sleeps, tasks, entries, workouts, checkIns] = await Promise.all([
    db.sleepLogs.where('date').between(from, today, true, true).toArray(),
    db.tasks.where('completedAt').aboveOrEqual(fromDateKey(from).getTime()).toArray(),
    db.timeEntries.where('date').between(from, today, true, true).toArray(),
    db.workoutLogs.where('date').between(from, today, true, true).toArray(),
    db.checkIns.where('date').between(from, today, true, true).toArray(),
  ]);

  const input: InsightInput = { sleep: {}, tasksDone: {}, focusMin: {}, workoutMin: {}, energy: {} };
  for (const s of sleeps) input.sleep[s.date] = sleepHours(s);
  for (const t of tasks) if (t.completedAt !== undefined) add(input.tasksDone, toDateKey(t.completedAt), 1);
  for (const e of entries) {
    if (e.source === 'pomodoro' && e.end !== undefined)
      add(input.focusMin, e.date, Math.round((e.end - e.start) / 60_000));
  }
  for (const w of workouts) add(input.workoutMin, w.date, w.durationMin);
  for (const c of checkIns) input.energy[c.date] = c.energy;
  return input;
}

export function useInsightInput(today: DateKey): InsightInput | undefined {
  return useLiveQuery(() => loadInsightInput(today), [today]);
}
