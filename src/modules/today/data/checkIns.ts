import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { naturalId, newRecord, touch } from '../../../core/ids';
import type { CheckIn, DateKey, Id } from '../../../core/types';
import type { CheckInFields } from '../logic/checkIn';

/**
 * Creates the day's check-in or replaces the fields of the existing one (one record per day).
 * Its id is `naturalId('checkIn', date)` (#275): the same day on two devices is one record for the sync.
 */
export async function saveCheckIn(date: DateKey, fields: CheckInFields, now: number = Date.now()): Promise<Id> {
  return db.transaction('rw', db.checkIns, async () => {
    const existing = await db.checkIns.where('date').equals(date).first();
    if (existing) {
      await db.checkIns.put({ ...touch(fields, now), id: existing.id, date, createdAt: existing.createdAt });
      return existing.id;
    }
    const record = newRecord({ ...fields, date }, now, naturalId('checkIn', date));
    await db.checkIns.add(record);
    return record.id;
  });
}

/** `null` when there is no check-in for the day, `undefined` while loading. */
export function useCheckIn(date: DateKey): CheckIn | null | undefined {
  return useLiveQuery(async () => (await db.checkIns.where('date').equals(date).first()) ?? null, [date]);
}
