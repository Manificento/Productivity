import Dexie, { type Transaction } from 'dexie';
import { naturalId } from '../ids';
import type { Id, SyncOutboxEntry } from '../types';
import { SYNC_OUTBOX } from './outbox';

/**
 * Tables whose records exist once per natural key — a day, a habit and a day, a day and a meal (ADR-0009, sync
 * p. 5). The id of such a record is `naturalId(…)` from `core/ids.ts`, the same on every device.
 */
export const NATURAL_KEY_TABLES = ['checkIns', 'sleepLogs', 'habitLogs', 'mealLogs', 'weightLogs'] as const;

export type NaturalKeyTable = (typeof NATURAL_KEY_TABLES)[number];

export function isNaturalKeyTable(name: string): name is NaturalKeyTable {
  return (NATURAL_KEY_TABLES as readonly string[]).includes(name);
}

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const time = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/**
 * The natural id of a stored row, or `undefined` when the row lacks what identifies it (no valid day, habit or
 * meal kind). Never throws: it reads rows written by old versions and rows of a backup file.
 */
export function naturalIdOf(table: NaturalKeyTable, row: unknown): Id | undefined {
  if (!isRow(row)) return undefined;
  const { date, habitId, kind } = row as Record<string, never>;
  try {
    switch (table) {
      case 'checkIns':
        return naturalId('checkIn', date);
      case 'sleepLogs':
        return naturalId('sleep', date);
      case 'habitLogs':
        return naturalId('habitLog', habitId, date);
      case 'mealLogs':
        return naturalId('meal', date, kind);
      case 'weightLogs':
        return naturalId('weight', date);
    }
  } catch {
    return undefined;
  }
}

/**
 * Moves the rows of a natural-key table under their natural ids (contract #275). Used by the Dexie upgrade to v8
 * and by `importAll` (a backup made before v8 holds random ids).
 *
 * - A row is copied under `naturalIdOf(row)`; nothing else in it changes (`createdAt` and `updatedAt` stay — the
 *   content did not change, and the sync compares `updatedAt` between devices).
 * - Several rows of one id (duplicates of a day): the row with the largest `updatedAt` stays; with equal times —
 *   the one with the later old id, so every device picks the same row.
 * - `mealLogs`: every item gets `id` and `updatedAt` (see `withItemIds`); when several meals collapse into one id,
 *   the latest record stays and the items of all of them are united (`uniteItems`).
 * - A row without its natural key (a broken date) is kept as it is, under its old id.
 *
 * Pure, never throws, idempotent: rows that are already migrated come back unchanged. The result keeps the order
 * of the first row of each id.
 */
export function withNaturalIds(table: NaturalKeyTable, rows: readonly unknown[]): unknown[] {
  const groups: { id: Id | undefined; rows: unknown[] }[] = [];
  const byId = new Map<Id, unknown[]>();
  for (const row of rows) {
    const id = naturalIdOf(table, row) ?? (isRow(row) ? text(row.id) : undefined);
    const same = id === undefined ? undefined : byId.get(id);
    if (same) {
      same.push(row);
      continue;
    }
    const group = { id, rows: [row] };
    groups.push(group);
    if (id !== undefined) byId.set(id, group.rows);
  }
  return groups.map((group) => (group.id === undefined ? group.rows[0] : settle(table, group.id, group.rows as Row[])));
}

/** One row out of the rows that share an id. */
function settle(table: NaturalKeyTable, id: Id, rows: Row[]): Row {
  const prepared = table === 'mealLogs' ? rows.map(withItemIds) : rows;
  const latest = prepared.reduce((a, b) => (isLater(b, a) ? b : a));
  const items = prepared.length > 1 && table === 'mealLogs' ? uniteItems(prepared) : undefined;
  return { ...latest, id, ...(items && { items }) };
}

/** Last writer wins; on equal times the later id does (as `toggleHabit` treats duplicates of a day). */
function isLater(b: Row, a: Row): boolean {
  const [timeA, timeB] = [time(a.updatedAt), time(b.updatedAt)];
  return timeB > timeA || (timeB === timeA && String(b.id) > String(a.id));
}

/**
 * Items written before v8 have no `id` and no `updatedAt`. The id is made from the record's OLD id and the item's
 * position, not by chance: two devices that hold the same data (restored from one backup) give the item the same
 * id, so the sync unites their lists without doubling every item. `updatedAt` is the record's.
 */
function withItemIds(meal: Row): Row {
  if (!Array.isArray(meal.items)) return meal;
  const items = meal.items.map((item: unknown, index) =>
    isRow(item)
      ? {
          ...item,
          id: text(item.id) ?? `${String(meal.id)}:${index}`,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : time(meal.updatedAt),
        }
      : item,
  );
  return { ...meal, items };
}

/**
 * Union of the items of several records of one meal (ADR-0009, sync p. 5): older records first — later items of
 * a meal are newer; an item present in two records (same id) is kept once, with its later edit.
 */
function uniteItems(meals: Row[]): unknown[] | undefined {
  const lists = meals
    .filter((meal) => Array.isArray(meal.items))
    .sort((a, b) => time(a.createdAt) - time(b.createdAt) || (String(a.id) < String(b.id) ? -1 : 1));
  if (lists.length === 0) return undefined;
  const united: unknown[] = [];
  const position = new Map<string, number>();
  for (const item of lists.flatMap((meal) => meal.items as unknown[])) {
    const id = isRow(item) ? text(item.id) : undefined;
    const at = id === undefined ? undefined : position.get(id);
    if (at === undefined) {
      if (id !== undefined) position.set(id, united.length);
      united.push(item);
    } else if (time((item as Row).updatedAt) > time((united[at] as Row).updatedAt)) {
      united[at] = item;
    }
  }
  return united;
}

/**
 * The data migration of Dexie v8 (contract #275): every live row of the natural-key tables is rewritten by
 * `withNaturalIds`, in the upgrade transaction — all or nothing.
 *
 * The tables are emptied first, so nothing stays under a random id, tombstones included: a tombstone carries no
 * day, so it cannot be moved to a natural id, and no server has seen the id it deletes (nothing was pushed before
 * v8). For the same reason the outbox entries of the old ids are removed instead of being left as deletions to
 * push; every migrated row is queued under its new id, so the first cloud copy sends it.
 *
 * No other table refers to the ids of these five tables, so there is nothing else to rewrite.
 * `.then()` chains only — see `outbox.ts`.
 */
export function migrateToNaturalIds(tx: Transaction, now: number = Date.now()): PromiseLike<unknown> {
  const outbox = tx.table<SyncOutboxEntry, [string, string]>(SYNC_OUTBOX);
  return NATURAL_KEY_TABLES.reduce<PromiseLike<unknown>>(
    (done, name) =>
      done.then(() => {
        const table = tx.table<Row, Id>(name);
        return table.toArray().then((rows) => {
          const migrated = withNaturalIds(name, rows) as Row[];
          const queued = migrated.map((row): SyncOutboxEntry => ({ table: name, key: row.id as Id, updatedAt: now }));
          return table
            .clear()
            .then(() => table.bulkAdd(migrated))
            .then(() => outbox.where('[table+key]').between([name, Dexie.minKey], [name, Dexie.maxKey]).delete())
            .then(() => outbox.bulkPut(queued));
        });
      }),
    Dexie.Promise.resolve(),
  );
}
