import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { loadDailyTargets } from '../../../core/adaptation/useDailyTargets';
import type { DateKey } from '../../../core/types';

/** How far back streaks take «только ключевые» days into account. */
export const RELAXED_LOOKBACK_DAYS = 60;

/**
 * Days up to `today` (inclusive) whose daily targets say `habitsMode = 'essential'`.
 * Adaptation rules stay in the core: this only reads its result for each day.
 */
export function useRelaxedDays(today: DateKey): ReadonlySet<DateKey> | undefined {
  return useLiveQuery(async () => {
    const days = Array.from({ length: RELAXED_LOOKBACK_DAYS + 1 }, (_, i) => shiftDateKey(today, -i));
    const targets = await Promise.all(days.map((d) => loadDailyTargets(d)));
    return new Set(days.filter((_, i) => targets[i]?.habitsMode === 'essential'));
  }, [today]);
}
