import { z } from 'zod';
import { toDateKey } from '../dates';
import { db } from '../db';
import { newRecord, touch } from '../ids';
import type { SleepLog } from '../types';
import { sleepHours } from './sleepTime';

/**
 * The ONE write path for sleep records (contract C1).
 * Owner of `sleepLogs` is the health module; `today` (morning screen) writes sleep only through
 * this function, so validation and the one-record-per-night rule live in a single place.
 */
export const SleepInput = z
  .object({
    bedtime: z.number().int(),
    wakeTime: z.number().int(),
    quality: z.number().int().min(1).max(5),
  })
  .refine((s) => s.wakeTime >= s.bedtime, { message: 'Подъём должен быть позже отбоя' })
  .refine((s) => s.wakeTime < s.bedtime || sleepHours(s) >= 0.25, {
    message: 'Сон короче 15 минут — проверьте время',
  })
  .refine((s) => sleepHours(s) <= 16, { message: 'Сон длиннее 16 часов — проверьте время' });

export type SleepInput = z.infer<typeof SleepInput>;

/**
 * Creates or updates the sleep record for the night that ended on the wake-up day
 * (`date` = local day of `wakeTime`; one record per day).
 */
export async function saveSleep(input: SleepInput, now: number = Date.now()): Promise<SleepLog> {
  const valid = SleepInput.parse(input);
  const date = toDateKey(valid.wakeTime);
  return db.transaction('rw', db.sleepLogs, async () => {
    const existing = await db.sleepLogs.where('date').equals(date).first();
    if (existing) {
      const updated: SleepLog = { ...existing, ...touch(valid, now), date };
      await db.sleepLogs.put(updated);
      return updated;
    }
    const created: SleepLog = newRecord({ ...valid, date }, now);
    await db.sleepLogs.add(created);
    return created;
  });
}

/**
 * Removes a sleep record. Use when an edit moves a night to another wake-up day:
 * `deleteSleep(old.id)` then `saveSleep(newValues)`, inside one user action.
 */
export async function deleteSleep(id: string): Promise<void> {
  await db.sleepLogs.delete(id);
}
