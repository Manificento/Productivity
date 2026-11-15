import type { DBCore, DBCoreMutateResponse, DBCoreTable, Middleware } from 'dexie';
import type { SyncOutboxEntry } from '../types';
import { isLocalOnlySetting } from './localOnly';

/** The outgoing queue of the sync (ADR-0009, sync p. 1). Not a data table: it is not in `TABLE_NAMES`. */
export const SYNC_OUTBOX = 'syncOutbox';

const SETTINGS = 'settings';

/**
 * Records every changed row of every table in `syncOutbox`, inside the transaction that changed it.
 *
 * A Dexie hook cannot do this: it may only write to the tables of the current transaction, and modules open
 * transactions over their own tables. A DBCore middleware can — it adds `syncOutbox` to every `readwrite`
 * transaction, so the row and its outbox entry commit or roll back together, and modules stay unchanged.
 *
 * - One entry per row (`[table+key]`): a later change replaces the earlier entry, so the queue never outgrows the data.
 * - A physical delete (`delete`, `bulkDelete`, a delete by range, `clear`) is recorded too: an entry whose row is
 *   gone is a deletion to push.
 * - `settings` keys from `localOnly.ts` are device state and are never recorded.
 * - Rows are stored exactly as the module wrote them: the middleware adds entries, it never changes a row. For
 *   `settings`, whose rows carry no write time yet, the entry's `updatedAt` is the time of the last change.
 *
 * All calls go through `.then()` of the promises Dexie returns: that keeps Dexie's transaction zone, which the
 * middlewares below rely on. Do not rewrite it with async/await.
 */
export const outboxMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'lifeos-sync-outbox',
  // Above Dexie's own middlewares (hooks = 2, cache and observability = 0): they see the outbox writes as usual.
  level: 10,
  create(down) {
    const hasOutbox = down.schema.tables.some((t) => t.name === SYNC_OUTBOX);
    if (!hasOutbox) return {};
    return {
      transaction(stores, mode, options) {
        const scope = mode === 'readwrite' && !stores.includes(SYNC_OUTBOX) ? [...stores, SYNC_OUTBOX] : stores;
        return down.transaction(scope, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (name === SYNC_OUTBOX) return table;
        return { ...table, mutate: trackMutations(table, down.table(SYNC_OUTBOX)) };
      },
    };
  },
};

function trackMutations(table: DBCoreTable, outbox: DBCoreTable): DBCoreTable['mutate'] {
  const { name } = table;
  const { primaryKey } = table.schema;
  const isTracked = (key: unknown): boolean => !(name === SETTINGS && isLocalOnlySetting(key));

  return (req) => {
    const now = Date.now();
    const record = (
      keys: unknown[],
      res: DBCoreMutateResponse,
    ): Promise<DBCoreMutateResponse> | DBCoreMutateResponse => {
      const values = keys
        .filter((key, i) => key !== undefined && !(i in res.failures) && isTracked(key))
        .map((key): SyncOutboxEntry => ({ table: name, key: key as string, updatedAt: now }));
      if (values.length === 0) return res;
      return outbox.mutate({ trans: req.trans, type: 'put', values }).then(() => res);
    };

    switch (req.type) {
      case 'deleteRange':
        // The range says nothing about which rows it removes: resolve their keys first.
        return table
          .query({ trans: req.trans, values: false, query: { index: primaryKey, range: req.range } })
          .then(({ result: keys }) => table.mutate(req).then((res) => record(keys, res)));
      case 'delete':
        return table.mutate(req).then((res) => record(req.keys, res));
      case 'add':
      case 'put':
        return table.mutate(req).then((res) => record(res.results ?? [], res));
    }
  };
}
