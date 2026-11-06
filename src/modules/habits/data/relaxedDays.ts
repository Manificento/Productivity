import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { loadDailyTargets } from '../../../core/adaptation/useDailyTargets';
import type { DateKey } from '../../../core/types';

/**
 * Days up to `today` whose daily targets say `habitsMode = 'essential'`.
 * Only event days (and today) can be such days, so the core is asked for those alone; it still decides the mode.
 */
export function useRelaxedDays(today: DateKey): ReadonlySet<DateKey> | undefined {
  return useLiveQuery(async () => {
    const events = await db.lifeEvents.where('date').belowOrEqual(today).toArray();
    const days = [...new Set([today, ...events.map((e) => e.date)])];
    const targets = await Promise.all(days.map((d) => loadDailyTargets(d)));
    return new Set(days.filter((_, i) => targets[i]?.habitsMode === 'essential'));
  }, [today]);
}
