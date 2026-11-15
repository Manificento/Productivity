import { z } from 'zod';
import { toDateKey } from '../dates';
import { db, softDelete } from '../db';
import { naturalId, newRecord, touch } from '../ids';
import type { BaseRecord, SleepLog } from '../types';
import { sleepHours } from './sleepTime';

const ImportKey = z.string().trim().min(1);

const Stage = z.object({
  start: z.number().int(),
  end: z.number().int(),
  stage: z.enum(['light', 'deep', 'rem', 'awake'], 'Неизвестный этап сна'),
});

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
    /** Imported nights only (Sleep Cycle, Health): the app that recorded it… */
    sourceId: ImportKey.optional(),
    /** …and its id there. Both or neither. */
    externalId: ImportKey.optional(),
    /** Stages from night sensing (#250): in order, not overlapping, within the night. */
    stages: z.array(Stage).optional(),
  })
  .refine(
    (s) =>
      !s.stages ||
      s.stages.every(
        (x, i) =>
          x.start < x.end &&
          x.start >= s.bedtime &&
          x.end <= s.wakeTime &&
          (i === 0 || x.start >= s.stages![i - 1]!.end),
      ),
    { message: 'Этапы сна должны идти по порядку внутри ночи', path: ['stages'] },
  )
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
 * (`date` = local day of `wakeTime`; one record per day, its id is `naturalId('sleep', date)`).
 *
 * Entered in LifeOS (no `sourceId`): the day's record is created or overwritten. An imported night corrected by hand
 * keeps `sourceId` (it was not lived in the app) but loses `externalId`: the next re-import no longer reverts it.
 * Imported (`sourceId` + `externalId`, #227): a re-import updates its own record (no duplicate), and never overwrites
 * a night the day already has (entered or corrected by hand, or from another app) — the import only fills empty days.
 * Then, and when a re-imported night moves onto such a day, the day's existing record is returned, not this night.
 */
export async function saveSleep(input: SleepInput, now: number = Date.now()): Promise<SleepLog> {
  const valid = SleepInput.parse(input);
  const date = toDateKey(valid.wakeTime);
  const { sourceId, externalId } = valid;
  return db.transaction('rw', db.sleepLogs, async () => {
    const onDay = await db.sleepLogs.where('date').equals(date).first();
    if (sourceId === undefined || externalId === undefined) {
      const entered = {
        date,
        bedtime: valid.bedtime,
        wakeTime: valid.wakeTime,
        quality: valid.quality,
        ...(valid.stages && { stages: valid.stages }),
      };
      if (onDay) {
        const { externalId: _wasImportId, stages: oldStages, ...rest } = onDay;
        // Stages describe the night as it was: they stay only while its times stay.
        const sameNight = onDay.bedtime === valid.bedtime && onDay.wakeTime === valid.wakeTime;
        const updated: SleepLog = {
          ...rest,
          ...(sameNight && oldStages && { stages: oldStages }),
          ...touch(entered, now),
        };
        await db.sleepLogs.put(updated);
        return updated;
      }
      return create(entered, now);
    }
    const own = await db.sleepLogs.where('[sourceId+externalId]').equals([sourceId, externalId]).first();
    if (own) {
      if (onDay && onDay.id !== own.id) {
        // The night moved onto a day that already has one: that night stays, this copy goes.
        await softDelete(db.sleepLogs, own.id, now);
        return onDay;
      }
      const next = { date, bedtime: valid.bedtime, wakeTime: valid.wakeTime };
      // Nothing changed in the app: no write, so live queries are not woken on every re-import.
      if (IMPORT_OWNED.every((key) => own[key] === next[key])) return own;
      // The id names the day: a night that moved to another day is deleted there and re-created under the new id.
      const updated: SleepLog = { ...own, ...next, id: naturalId('sleep', date), updatedAt: now };
      if (updated.id !== own.id) await softDelete(db.sleepLogs, own.id, now);
      await db.sleepLogs.put(updated);
      return updated;
    }
    if (onDay) return onDay;
    return create({ ...valid, date }, now);
  });
}

/**
 * A new night gets the id of its day (`sleep:<DateKey>`, #275): the same night logged on two devices is one record
 * for the sync. A night deleted earlier on that day left a tombstone with this id — `add` replaces it
 * (`core/sync/tombstones.ts`), so the day keeps one id through delete and re-create.
 */
async function create(night: Omit<SleepLog, keyof BaseRecord>, now: number): Promise<SleepLog> {
  const created: SleepLog = newRecord(night, now, naturalId('sleep', night.date));
  await db.sleepLogs.add(created);
  return created;
}

/**
 * Removes a sleep record. Use when an edit moves a night to another wake-up day:
 * `deleteSleep(old.id)` then `saveSleep(newValues)`, inside one user action.
 *
 * The record becomes a tombstone (`softDelete`, ADR-0009): reads no longer return it, and it keeps no data of the
 * night — so the day's unique key is free for a night saved later.
 */
export async function deleteSleep(id: string): Promise<void> {
  await softDelete(db.sleepLogs, id);
}
