import {
  FUTURE_TOLERANCE_MS,
  TOMBSTONE_TTL_MS,
  type PulledChange,
  type PushResult,
  type SyncChange,
} from '../core/sync/protocol';

interface StoredRow extends PulledChange {
  /** Server time of the write — what the tombstone's lifetime is counted from. */
  receivedAt: number;
}

const idOf = (ref: { table: string; key: string }): string => `${ref.table}\u0000${ref.key}`;

/**
 * The sync server of ONE user in memory — the rules of `infra/supabase/migrations/0001_sync_schema.sql`
 * (`sync_push`, `changes_since`), for tests of the protocol and of the engine without a network:
 *
 * - every stored version gets the next `rev`;
 * - an `updatedAt` more than five minutes ahead of the server's clock is cut to the server's time;
 * - last writer wins: a change is taken when its (`updatedAt`, `updatedBy`) is not earlier than the stored one;
 * - a meal (`mealLogs`) written by another device after the pusher's cursor (`since`) is never overwritten: the
 *   pusher has not seen it and must unite the items first;
 * - `replace` takes every change regardless;
 * - a change that is not taken comes back with the stored version (`current`).
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
    return changes.map((change): PushResult => {
      const { table, key, updatedBy } = change;
      const updatedAt = cut(change.updatedAt);
      const stored = this.rows.get(idOf(change));
      if (stored && !replace && !this.takes(stored, { ...change, updatedAt }, since)) {
        const { receivedAt: _receivedAt, ...current } = stored;
        return { table, key, rev: stored.rev, updatedAt: stored.updatedAt, applied: false, current };
      }
      this.rev += 1;
      const version =
        change.deletedAt === undefined
          ? { table, key, updatedAt, updatedBy, data: structuredClone(change.data ?? {}) }
          : { table, key, updatedAt, updatedBy, deletedAt: cut(change.deletedAt) };
      this.rows.set(idOf(change), { ...version, rev: this.rev, receivedAt: now });
      return { table, key, rev: this.rev, updatedAt, applied: true };
    });
  }

  private takes(stored: StoredRow, change: SyncChange, since: number): boolean {
    const isLater =
      change.updatedAt > stored.updatedAt ||
      (change.updatedAt === stored.updatedAt && change.updatedBy >= stored.updatedBy);
    const isUnseenMeal =
      change.table === 'mealLogs' &&
      stored.rev > since &&
      stored.updatedBy !== change.updatedBy &&
      stored.deletedAt === undefined &&
      change.deletedAt === undefined;
    return isLater && !isUnseenMeal;
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
