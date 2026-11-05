import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { DateKey, WeightLog } from '../../../core/types';
import { validateKg } from '../logic/trend';

/** All weight entries, oldest first; undefined while loading. */
export function useWeightLogs(): WeightLog[] | undefined {
  return useLiveQuery(() => db.weightLogs.orderBy('date').toArray(), []);
}

/** One entry per day: a second input for the same day replaces the first. */
export async function logWeight(date: DateKey, kg: number, now: number = Date.now()): Promise<WeightLog> {
  const error = validateKg(kg);
  if (error) throw new Error(error);
  return db.transaction('rw', db.weightLogs, async () => {
    const existing = await db.weightLogs.where('date').equals(date).first();
    if (existing) {
      const updated: WeightLog = { ...existing, ...touch({ kg }, now) };
      await db.weightLogs.put(updated);
      return updated;
    }
    const created: WeightLog = newRecord({ date, kg }, now);
    await db.weightLogs.add(created);
    return created;
  });
}
