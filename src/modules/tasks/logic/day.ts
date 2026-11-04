import { addDays, startOfDay } from 'date-fns';

/** Milliseconds from `now` to the next local midnight (always > 0). */
export function msUntilNextDay(now: number): number {
  return addDays(startOfDay(now), 1).getTime() - now;
}
