import Dexie, {
  cmp,
  type DBCore,
  type DBCoreCursor,
  type DBCoreIndex,
  type DBCoreMutateRequest,
  type DBCoreTable,
  type Middleware,
} from 'dexie';
import { SYNC_OUTBOX } from './outbox';

/** A row removed with `softDelete()`: it stays in IndexedDB for the sync, but the app must not see it. */
function isTombstone(row: unknown): boolean {
  return typeof row === 'object' && row !== null && (row as { deletedAt?: unknown }).deletedAt != null;
}

const isLive = (row: unknown): boolean => !isTombstone(row);

/** `DBCoreRangeType.Equal` — a const enum in Dexie's typings, so it cannot be imported as a value. */
const EQUAL = 1;

/**
 * Makes a tombstone behave like an absent row for everything that goes through `db` (ADR-0009, sync p. 2).
 *
 * Reads — `get`, `bulkGet`, `toArray`, `where`, `count`, cursors (`filter`, `each`, `keys`, `offset`, …) and so
 * `useLiveQuery` — never return a row with `deletedAt`. Dexie has no default filter, hence this DBCore middleware:
 * modules keep their queries as they are.
 *
 * Writes — a tombstone never blocks one. Before an `add` or `put`, tombstones that hold the row's primary key
 * (`add`) or one of its unique keys under another id (`&date`, `&[programId+date]`) are physically removed in the
 * same transaction; the outbox middleware below records that removal, so the deletion is still pushed. A `put` with
 * the tombstone's own id simply overwrites it — the way records with deterministic ids are re-created.
 *
 * `update`/`modify` find rows through the filtered reads, so they do not touch tombstones.
 *
 * Only `.then()` of the promises Dexie returns is used (see `outbox.ts`): do not rewrite with async/await.
 */
export const tombstoneMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'lifeos-tombstones',
  // Above the outbox middleware (10): removals made here are recorded there.
  level: 20,
  create(down) {
    return {
      table(name) {
        const table = down.table(name);
        const pkOf = table.schema.primaryKey.extractKey;
        // The outbox is not data; a table with an outbound key cannot be filtered (LifeOS has none).
        return name === SYNC_OUTBOX || !pkOf ? table : hideTombstones(table, pkOf);
      },
    };
  },
};

function hideTombstones(table: DBCoreTable, pkOf: (row: unknown) => unknown): DBCoreTable {
  const uniqueIndexes = table.schema.indexes.filter((index) => index.unique && !index.isPrimaryKey);

  return {
    ...table,
    get: (req) => table.get(req).then((row) => (isTombstone(row) ? undefined : row)),
    getMany: (req) => table.getMany(req).then((rows) => rows.map((row) => (isTombstone(row) ? undefined : row))),
    query(req) {
      // Keys alone do not tell a tombstone from a live row: always read the rows.
      const answer = (rows: unknown[]) => ({ result: req.values ? rows : rows.map(pkOf) });
      return table.query({ ...req, values: true }).then((res) => {
        const live = res.result.filter(isLive);
        const limited = req.limit !== undefined && req.limit !== Infinity;
        if (live.length === res.result.length || !limited) return answer(live);
        // Tombstones used up part of the limit: read the whole range and cut it after filtering.
        return table
          .query({ ...req, values: true, limit: Infinity })
          .then((all) => answer(all.result.filter(isLive).slice(0, req.limit)));
      });
    },
    // A native count would include tombstones. Reading the rows also makes a live query observe them, so a
    // `softDelete` (which changes no index key) re-runs a live `count()`.
    count: (req) => table.query({ ...req, values: true }).then((res) => res.result.filter(isLive).length),
    openCursor: (req) =>
      table
        .openCursor({ ...req, values: true, unique: false })
        .then((cursor) => cursor && liveCursor(cursor, !!req.unique)),
    mutate: (req) =>
      req.type === 'add' || req.type === 'put'
        ? removeBlockingTombstones(table, pkOf, uniqueIndexes, req).then(() => table.mutate(req))
        : table.mutate(req),
  };
}

/**
 * A cursor that steps over tombstones. `unique` iteration (`uniqueKeys`) is done here, over a plain cursor, because
 * a native unique cursor would stop on a key's first row even when that row is a tombstone and a live row follows.
 */
function liveCursor(cursor: DBCoreCursor, unique: boolean): DBCoreCursor {
  let toSkip = 0;
  let lastKey: unknown;
  let hasLastKey = false;

  const start: DBCoreCursor['start'] = (onNext) =>
    cursor.start(() => {
      if (isTombstone(cursor.value)) return cursor.continue();
      if (unique) {
        if (hasLastKey && cmp(cursor.key, lastKey) === 0) return cursor.continue();
        lastKey = cursor.key;
        hasLastKey = true;
      }
      if (toSkip > 0) {
        toSkip -= 1;
        return cursor.continue();
      }
      onNext();
    });

  // The getters are restated because the underlying cursor may be a native IDBCursor, whose accessors refuse
  // another receiver; the remaining members are plain properties and are inherited.
  return Object.create(cursor, {
    start: { value: start },
    // `offset()`: skip `count` LIVE rows, not `count` stored rows.
    advance: {
      value: (count: number) => {
        toSkip = count - 1;
        cursor.continue();
      },
    },
    key: { get: () => cursor.key },
    primaryKey: { get: () => cursor.primaryKey },
    value: { get: () => cursor.value },
  }) as DBCoreCursor;
}

/** Whether IndexedDB would put the key into an index (a row with an incomplete key is simply not indexed). */
function isIndexable(key: unknown): boolean {
  if (Array.isArray(key)) return key.every(isIndexable);
  return typeof key === 'string' || (typeof key === 'number' && !Number.isNaN(key)) || key instanceof Date;
}

function removeBlockingTombstones(
  table: DBCoreTable,
  pkOf: (row: unknown) => unknown,
  uniqueIndexes: DBCoreIndex[],
  req: Extract<DBCoreMutateRequest, { type: 'add' | 'put' }>,
): Promise<unknown> {
  const { trans, values } = req;
  const keys = req.keys ?? values.map(pkOf);
  const blocking = new Set<unknown>();
  const lookups: Promise<unknown>[] = [];

  if (req.type === 'add') {
    // `add` over a tombstone with the same id would fail on the primary key.
    const own = keys.filter(isIndexable);
    if (own.length > 0) {
      lookups.push(
        table.getMany({ trans, keys: own }).then((rows) => {
          rows.forEach((row, i) => isTombstone(row) && blocking.add(own[i]));
        }),
      );
    }
  }
  for (const index of uniqueIndexes) {
    values.forEach((value, i) => {
      const key = index.extractKey?.(value);
      if (!isIndexable(key)) return;
      const range = { type: EQUAL, lower: key, upper: key };
      lookups.push(
        table.query({ trans, values: true, query: { index, range } }).then(({ result }) => {
          for (const row of result) {
            if (isTombstone(row) && cmp(pkOf(row), keys[i]) !== 0) blocking.add(pkOf(row));
          }
        }),
      );
    });
  }

  return Dexie.Promise.all(lookups).then(() =>
    blocking.size > 0 ? table.mutate({ trans, type: 'delete', keys: [...blocking] }) : undefined,
  );
}
