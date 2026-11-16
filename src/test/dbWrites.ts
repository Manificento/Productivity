/**
 * Watches the IndexedDB transactions of a test run (#292).
 *
 * Since #274 every write also writes `syncOutbox`, so all writes queue one behind another: a write a test started and
 * did not wait for runs into the next test (after its `clear()`, or holding its tables). After each test
 * `src/test/setup.ts` waits until the database is quiet and fails the test if a write that changed data committed
 * only then.
 */

interface Tracked {
  /** Object stores the transaction changed; empty for a read, or a write that found nothing to change. */
  readonly written: Set<string>;
}

const byTransaction = new WeakMap<IDBTransaction, Tracked>();
const open = new Set<Tracked>();
let started = 0;
let committed: Tracked[] = [];

// Captured before any test can install fake timers: the waits below run on the real clock.
const realSetTimeout = globalThis.setTimeout;
const nextTurn = () => new Promise<void>((resolve) => realSetTimeout(resolve, 1));

/** Wraps fake-indexeddb's `IDBDatabase.transaction` and the write methods. Called once, from `src/test/setup.ts`. */
export function trackDbTransactions(): void {
  const db = globalThis.IDBDatabase.prototype;
  const transaction = db.transaction;
  db.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
    const tx = transaction.apply(this, args);
    const tracked: Tracked = { written: new Set() };
    byTransaction.set(tx, tracked);
    open.add(tracked);
    started++;
    tx.addEventListener('complete', () => {
      open.delete(tracked);
      committed.push(tracked);
    });
    tx.addEventListener('abort', () => open.delete(tracked));
    return tx;
  } as IDBDatabase['transaction'];

  const mark = (store: IDBObjectStore) => byTransaction.get(store.transaction)?.written.add(store.name);
  const stores = globalThis.IDBObjectStore.prototype;
  const { put, add, delete: remove, clear } = stores;
  stores.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
    mark(this);
    return put.apply(this, args);
  };
  stores.add = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
    mark(this);
    return add.apply(this, args);
  };
  // A delete that finds no row changes nothing (removing a key that is not there): count the rows first, in the
  // same transaction, so the count sees what the delete is about to remove.
  const markIfFound = (store: IDBObjectStore, query?: IDBValidKey | IDBKeyRange) => {
    if (store.transaction.mode === 'readonly') return; // the delete itself throws
    try {
      const found = store.count(query);
      found.addEventListener('success', () => {
        if (found.result > 0) mark(store);
      });
    } catch {
      mark(store);
    }
  };
  stores.delete = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
    markIfFound(this, query);
    return remove.call(this, query);
  };
  stores.clear = function (this: IDBObjectStore) {
    markIfFound(this);
    return clear.call(this);
  };
  const cursors = globalThis.IDBCursor.prototype;
  const { update, delete: removeAt } = cursors;
  const storeOf = (c: IDBCursor) => (c.source instanceof IDBIndex ? c.source.objectStore : c.source);
  cursors.update = function (this: IDBCursor, value: unknown) {
    mark(storeOf(this));
    return update.call(this, value);
  };
  cursors.delete = function (this: IDBCursor) {
    mark(storeOf(this));
    return removeAt.call(this);
  };
}

/** Longest wait for the database to fall quiet, in turns of at least 1 ms of the real clock (`Date` may be faked). */
const SETTLE_LIMIT_TURNS = 3000;
/** Turns without a transaction that count as quiet: a write often follows a read a turn or two later. */
const QUIET_TURNS = 3;

/**
 * End of a test (after unmount): waits until no transaction runs or starts for a few turns, then returns the object
 * stores changed by transactions that committed during that wait — the writes the test left running. A transaction
 * that changed nothing (a read, or a write that found nothing to do) or was rolled back is not counted.
 */
export async function writesLeftByTest(): Promise<string[]> {
  committed = [];
  let calm = 0;
  for (let turns = 0; calm < QUIET_TURNS && turns < SETTLE_LIMIT_TURNS; turns++) {
    const before = started;
    await nextTurn();
    calm = open.size === 0 && started === before ? calm + 1 : 0;
  }
  // `syncOutbox` is written with every change: the table of the change says more.
  const tables = (t: Tracked) => [...t.written].filter((store) => store !== 'syncOutbox');
  const left = new Set(committed.flatMap(tables));
  for (const t of open) for (const store of tables(t)) left.add(`${store} (не закончилась)`);
  return [...left].sort();
}
