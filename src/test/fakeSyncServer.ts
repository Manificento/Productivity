import {
  FUTURE_TOLERANCE_MS,
  TOMBSTONE_TTL_MS,
  uniqueKeyOf,
  type PulledChange,
  type PushResult,
  type RowData,
  type SyncChange,
} from '../core/sync/protocol';

interface StoredRow extends PulledChange {
  /** Server time of the write — what the tombstone's lifetime is counted from. */
  receivedAt: number;
}

const idOf = (ref: { table: string; key: string }): string => `${ref.table}\u0000${ref.key}`;
const isObject = (value: unknown): value is RowData => typeof value === 'object' && value !== null;

/**
 * The sync server of ONE user in memory — the rules of `infra/supabase/migrations/0001_sync_schema.sql`
 * (`sync_push`, `changes_since`), for tests of the protocol and of the engine without a network:
 *
 * - every stored version gets the next `rev`;
 * - an `updatedAt` more than five minutes ahead of the server's clock is cut to the server's time — the row's and,
 *   in a meal (`mealLogs`), every item's (`data.items[]`), `deletedAt` likewise;
 * - last writer wins: a change is taken when its (`updatedAt`, `updatedBy`) is not earlier than the stored one;
 * - a live meal (`mealLogs`) written by another device after the pusher's cursor (`since`) is never overwritten,
 *   not by a meal and not by a deletion: the pusher has not seen it and must merge first;
 * - no two live rows hold one unique key (`UNIQUE_KEYS`: one session of a program per day): a live row is not
 *   taken when, with the push applied, another live row would hold its key — a stored row that stays as it is
 *   (the push does not move it, or its own change is not taken) or another change of the push. A whole push is
 *   judged at once, so rows may swap days in it, and a change that relied on a refused one is refused with it;
 * - `replace` takes every change regardless;
 * - a change that is not taken comes back with the stored version of its row (`current`), when there is one.
 *
 * The real server is checked against the same rules by `infra/supabase/tests/migrations.test.sh`.
 */
export class FakeSyncServer {
  private readonly rows = new Map<string, StoredRow>();
  private rev = 0;
  /** The server's clock. */
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  push(
    changes: readonly SyncChange[],
    { since = 0, replace = false }: { since?: number; replace?: boolean } = {},
  ): PushResult[] {
    const now = this.now();
    const cut = (time: number): number => (time > now + FUTURE_TOLERANCE_MS ? now : time);
    const incoming = changes.map((change): SyncChange => {
      const { table, key, updatedBy } = change;
      const updatedAt = cut(change.updatedAt);
      return change.deletedAt === undefined
        ? { table, key, updatedAt, updatedBy, data: cutItemTimes(table, structuredClone(change.data ?? {}), cut) }
        : { table, key, updatedAt, updatedBy, deletedAt: cut(change.deletedAt) };
    });
    // Every change is judged against the rows as they were before the push, like the one statement of `sync_push`.
    const before = new Map<string, StoredRow>(this.rows);
    const storedOf = (version: SyncChange) => before.get(idOf(version));
    const taken = new Set(
      incoming.filter((version) => {
        const stored = storedOf(version);
        return replace || !stored || takes(stored, version, since);
      }),
    );
    if (!replace) refuseTakenKeys(taken, before);
    return incoming.map((version): PushResult => {
      if (!taken.has(version)) return refusal(version, storedOf(version));
      this.rev += 1;
      this.rows.set(idOf(version), { ...version, rev: this.rev, receivedAt: now });
      return { table: version.table, key: version.key, rev: this.rev, updatedAt: version.updatedAt, applied: true };
    });
  }

  /** `changes_since(since, max_rows)`: the versions with a larger `rev`, in the order of `rev`. */
  changesSince(since: number, maxRows = 500): PulledChange[] {
    return [...this.rows.values()]
      .filter((row) => row.rev > since)
      .sort((a, b) => a.rev - b.rev)
      .slice(0, maxRows)
      .map(({ receivedAt: _receivedAt, ...change }) => structuredClone(change));
  }

  /** Tombstones live 90 days on the server (ADR-0009, sync p. 2); this is the clean-up that removes older ones. */
  expireTombstones(): void {
    for (const [id, row] of this.rows) {
      if (row.deletedAt !== undefined && this.now() - row.receivedAt > TOMBSTONE_TTL_MS) this.rows.delete(id);
    }
  }
}

/** The answer for a change that was not taken: the stored version of its row, when the server has one. */
function refusal({ table, key, updatedAt }: SyncChange, stored: StoredRow | undefined): PushResult {
  if (!stored) return { table, key, rev: 0, updatedAt, applied: false };
  const { receivedAt: _receivedAt, ...current } = stored;
  return { table, key, rev: stored.rev, updatedAt: stored.updatedAt, applied: false, current };
}

/** Last writer wins, and a live meal the pusher has not seen is not overwritten. */
function takes(stored: StoredRow, change: SyncChange, since: number): boolean {
  const isLater =
    change.updatedAt > stored.updatedAt ||
    (change.updatedAt === stored.updatedAt && change.updatedBy >= stored.updatedBy);
  const isUnseenMeal =
    change.table === 'mealLogs' &&
    stored.rev > since &&
    stored.updatedBy !== change.updatedBy &&
    stored.deletedAt === undefined;
  return isLater && !isUnseenMeal;
}

/**
 * The unique keys: drops from `taken` every live change whose key another live row would hold too once the push
 * is applied, and again while there is one — a row whose change is dropped stays where it was, and that may be the
 * key of another change.
 */
function refuseTakenKeys(taken: Set<SyncChange>, before: ReadonlyMap<string, SyncChange>): void {
  for (;;) {
    const after = new Map(before);
    for (const version of taken) after.set(idOf(version), version);
    const refused = [...taken].filter((version) => isKeyHeld([...after.values()], version));
    if (refused.length === 0) return;
    for (const version of refused) taken.delete(version);
  }
}

/** Whether another live row of `rows` holds the unique key of a live change. */
function isKeyHeld(rows: readonly SyncChange[], change: SyncChange): boolean {
  const unique = uniqueKeyOf(change.table, change.data);
  if (unique === undefined || change.deletedAt !== undefined) return false;
  return rows.some(
    (held) =>
      held.table === change.table &&
      held.key !== change.key &&
      held.deletedAt === undefined &&
      uniqueKeyOf(held.table, held.data) === unique,
  );
}

/** `sync_cut_item_times`: the times of the items of a meal are the writer's clock too. */
function cutItemTimes(table: string, data: RowData, cut: (time: number) => number): RowData {
  if (table !== 'mealLogs' || !Array.isArray(data.items)) return data;
  const cutTime = (value: unknown): unknown => (typeof value === 'number' ? cut(value) : value);
  const items = data.items.map((item: unknown) =>
    isObject(item)
      ? {
          ...item,
          ...('updatedAt' in item && { updatedAt: cutTime(item.updatedAt) }),
          ...('deletedAt' in item && { deletedAt: cutTime(item.deletedAt) }),
        }
      : item,
  );
  return { ...data, items };
}
