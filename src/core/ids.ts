import type { BaseRecord, DateKey, Id, MealLog } from './types';

export function newId(): string {
  return crypto.randomUUID();
}

/**
 * What identifies a record that exists once per day (per habit, per meal kind) — the parts of its id.
 * Tables: `checkIns`, `sleepLogs`, `habitLogs`, `mealLogs`, `weightLogs`.
 */
export interface NaturalIdParts {
  checkIn: [date: DateKey];
  sleep: [date: DateKey];
  habitLog: [habitId: Id, date: DateKey];
  meal: [date: DateKey, kind: MealLog['kind']];
  weight: [date: DateKey];
}

export type NaturalIdKind = keyof NaturalIdParts;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_KINDS: readonly unknown[] = ['breakfast', 'lunch', 'dinner', 'snack'] satisfies MealLog['kind'][];

/** Whether a value has the shape of a `DateKey` ('YYYY-MM-DD'). */
export function isDateKeyShaped(value: unknown): value is DateKey {
  return typeof value === 'string' && DATE_KEY.test(value);
}

function dateKey(value: unknown): DateKey {
  if (!isDateKeyShaped(value)) throw new Error(`naturalId: день должен быть DateKey 'YYYY-MM-DD', получено «${value}»`);
  return value;
}

/**
 * The id of a «one per day» record, built from what identifies it (ADR-0009, sync p. 5):
 *
 *   naturalId('checkIn', date)            → 'checkIn:2026-11-05'
 *   naturalId('sleep', date)              → 'sleep:2026-11-05'      (date = the wake-up day)
 *   naturalId('habitLog', habitId, date)  → 'habitLog:<habitId>:2026-11-05'
 *   naturalId('meal', date, kind)         → 'meal:2026-11-05:lunch'
 *   naturalId('weight', date)             → 'weight:2026-11-05'
 *
 * The same day logged offline on two devices gets the same id, so the sync sees ONE record and merges it instead of
 * failing on a unique index (`&date`) or leaving a silent duplicate. Every writer of these tables creates records
 * with this id — never with `newId()`.
 *
 * Pure. Throws on a day that is not a `DateKey`, an empty habit id or an unknown meal kind: such an id would be
 * shared by unrelated records.
 */
export function naturalId<K extends NaturalIdKind>(kind: K, ...parts: NaturalIdParts[K]): Id;
export function naturalId(kind: NaturalIdKind, ...parts: unknown[]): Id {
  switch (kind) {
    case 'checkIn':
    case 'sleep':
    case 'weight':
      return `${kind}:${dateKey(parts[0])}`;
    case 'habitLog': {
      const [habitId, date] = parts;
      if (typeof habitId !== 'string' || habitId === '') throw new Error('naturalId: пустой habitId');
      return `${kind}:${habitId}:${dateKey(date)}`;
    }
    case 'meal': {
      const [date, mealKind] = parts;
      if (!MEAL_KINDS.includes(mealKind)) throw new Error(`naturalId: неизвестный приём пищи (kind) «${mealKind}»`);
      return `${kind}:${dateKey(date)}:${mealKind as string}`;
    }
  }
}

/**
 * Fills id/createdAt/updatedAt for a new record. The id is random unless given — a table with a natural key
 * passes `naturalId(…)`.
 */
export function newRecord<T extends object>(data: T, now: number = Date.now(), id: Id = newId()): T & BaseRecord {
  return { ...data, id, createdAt: now, updatedAt: now };
}

/** Bumps updatedAt on a patch. */
export function touch<T extends object>(patch: T, now: number = Date.now()): T & { updatedAt: number } {
  return { ...patch, updatedAt: now };
}
