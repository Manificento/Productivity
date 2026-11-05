import { shiftDateKey } from '../../../core/dates';
import type { DateKey, MeditationSession } from '../../../core/types';

export interface DayMinutes {
  date: DateKey;
  minutes: number;
}

/** Minutes per day for the 7 days ending at `today` (oldest first). */
export function lastWeek(sessions: readonly MeditationSession[], today: DateKey): DayMinutes[] {
  const days: DayMinutes[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = shiftDateKey(today, -i);
    const minutes = sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.durationMin, 0);
    days.push({ date, minutes });
  }
  return days;
}

/** Consecutive days with a session, ending today — or yesterday if today has none yet. */
export function streak(sessions: readonly MeditationSession[], today: DateKey): number {
  const days = new Set(sessions.map((s) => s.date));
  let day = days.has(today) ? today : shiftDateKey(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDateKey(day, -1);
  }
  return n;
}
