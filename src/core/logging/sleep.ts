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
const ImportKey = z.string().trim().min(1);

export const SleepInput = z
  .object({
    bedtime: z.number().int(),
    wakeTime: z.number().int(),
    quality: z.number().int().min(1).max(5),
    /** Imported nights only (Sleep Cycle, Health): the app that recorded it… */
    sourceId: ImportKey.optional(),
    /** …and its id there. Both or neither. */
    externalId: ImportKey.optional(),
  })
  .refine((s) => (s.sourceId === undefined) === (s.externalId === undefined), {
    message: 'У импортированной ночи нужны и источник, и внешний id',
    path: ['externalId'],
  })
  .refine((s) => s.wakeTime >= s.bedtime, { message: 'Подъём должен быть позже отбоя' })
  .refine((s) => s.wakeTime < s.bedtime || sleepHours(s) >= 0.25, {
    message: 'Сон короче 15 минут — проверьте время',
  })
  .refine((s) => sleepHours(s) <= 16, { message: 'Сон длиннее 16 часов — проверьте время' });

export type SleepInput = z.infer<typeof SleepInput>;

/** Fields an import owns: a re-import overwrites them; the quality entered in LifeOS stays. */
const IMPORT_OWNED = ['date', 'bedtime', 'wakeTime'] as const;

/**
 * Creates or updates the sleep record for the night that ended on the wake-up day
 * (`date` = local day of `wakeTime`; one record per day).
 *
 * Entered in LifeOS (no `sourceId`): the day's record is created or overwritten; an imported night edited by hand
 * keeps its import marks — it was not lived in the app.
 * Imported (`sourceId` + `externalId`, #227): a re-import updates its own record (no duplicate), and never overwrites
 * a night the day already has (entered by hand or from another app) — the import only fills empty days.
 */
export async function saveSleep(input: SleepInput, now: number = Date.now()): Promise<SleepLog> {
  const valid = SleepInput.parse(input);
  const date = toDateKey(valid.wakeTime);
  const { sourceId, externalId } = valid;
  return db.transaction('rw', db.sleepLogs, async () => {
    const onDay = await db.sleepLogs.where('date').equals(date).first();
    if (sourceId === undefined || externalId === undefined) {
      if (onDay) {
        const updated: SleepLog = { ...onDay, ...touch(valid, now), date };
        await db.sleepLogs.put(updated);
        return updated;
      }
      const created: SleepLog = newRecord({ ...valid, date }, now);
      await db.sleepLogs.add(created);
      return created;
    }
    const own = await db.sleepLogs.where('[sourceId+externalId]').equals([sourceId, externalId]).first();
    if (own) {
      if (onDay && onDay.id !== own.id) {
        // The night moved onto a day that already has one: that night stays, this copy goes.
        await db.sleepLogs.delete(own.id);
        return onDay;
      }
      const next = { date, bedtime: valid.bedtime, wakeTime: valid.wakeTime };
      // Nothing changed in the app: no write, so live queries are not woken on every re-import.
      if (IMPORT_OWNED.every((key) => own[key] === next[key])) return own;
      const updated: SleepLog = { ...own, ...next, updatedAt: now };
      await db.sleepLogs.put(updated);
      return updated;
    }
    if (onDay) return onDay;
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
