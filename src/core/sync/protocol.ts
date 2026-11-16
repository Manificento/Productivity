import type { Millis, SyncOutboxEntry } from '../types';
import { isLocalOnlySetting } from './localOnly';

/**
 * The sync protocol as pure functions (ADR-0009 «Синхронизация», ADR-0012): no React, no Dexie, no network, no
 * clock. The engine (Dexie + network) reads the local state, calls these functions and executes the plans they
 * return; the transport is `client.ts`, the server side is `infra/supabase/migrations/`.
 *
 *   push:  buildPush(outbox, rows, { deviceId }) → changes for the server → applyPushResult(results, local) → plan
 *   pull:  changes from the server               → applyPull(changes, local)                               → plan
 *   both resolve a row changed on both sides with merge(localRow, remoteRow)
 *
 * The one rule behind every plan: **a row with no entry in `syncOutbox` has no local change, so the server's
 * version replaces it; a row with an entry is merged** — last writer wins by `updatedAt`, then by `updatedBy`;
 * a meal (`mealLogs`) unites its `items` by `id` and is never lost to a deletion that has not seen it. The same
 * rule for a unique key that is not the primary key (`UNIQUE_KEYS`): the server's row takes it, the local row
 * that holds it gives way.
 */

/** How long the server keeps a tombstone (ADR-0009, sync p. 2); a device offline for longer needs a full sync. */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** The server does not trust an `updatedAt` further ahead of its own clock than this: it cuts it to server time. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type RowData = Record<string, unknown>;

/** A row as IndexedDB holds it (tombstones included), with the name of its table. */
export interface LocalRow {
  table: string;
  row: RowData;
}

/** What names a row everywhere: its table and its primary key (`id`, or `key` for `settings`). */
export interface RowRef {
  table: string;
  key: string;
}

/**
 * One version of one row as it travels between a device and the server.
 * `data` is the row without its key and sync fields (`updatedAt`, `updatedBy`, `deletedAt`); a tombstone
 * (`deletedAt` set) has no `data` — what the user deleted is not sent (ADR-0010, p. 1).
 */
export interface SyncChange extends RowRef {
  /** The writer's clock; the server cuts a time from the future to its own. */
  updatedAt: Millis;
  /** `device.id` of the device whose write this is. */
  updatedBy: string;
  deletedAt?: Millis;
  data?: RowData;
}

/** A version stored on the server: `rev` is the server's sequence number, the cursor of the pull. */
export interface PulledChange extends SyncChange {
  rev: number;
}

/** The server's answer for one pushed change. */
export interface PushResult extends RowRef {
  /** `rev` of the row on the server after the push. */
  rev: number;
  /** `updatedAt` of the row on the server after the push (the pushed one, cut to server time when from the future). */
  updatedAt: Millis;
  /**
   * `false`: the server did not store the change. It holds a later version of the row (or a meal the device has
   * not seen) and kept it — that version comes in `current`. Or the row's unique key (`UNIQUE_KEYS`) is held by a
   * row the device has not seen: then `current` is the server's version of the pushed row, absent when the server
   * has none; the change stays queued and the next pull, which brings the holder, resolves it (`applyPull`).
   */
  applied: boolean;
  current?: PulledChange;
}

/** What the device holds: the rows the changes are about (others may be left out), the queue and the device id. */
export interface LocalState {
  rows: readonly LocalRow[];
  outbox: readonly SyncOutboxEntry[];
  deviceId: string;
}

/** A local change that lost to the server's version — the engine keeps it in the conflict journal. */
export interface SyncConflict {
  local: SyncChange;
  remote: PulledChange;
}

/**
 * What the engine does with the answer of a push or with pulled changes, in ONE transaction marked so that the
 * outbox middleware does not queue these writes again (ADR-0010), in this order:
 * 1. `remove` — delete the rows physically. The server says they are deleted, or they give up a unique key to a
 *    row of `put` (`UNIQUE_KEYS`). A row may be in `remove` and in `put`: it is deleted and then written again,
 *    so no write of `put` meets a unique key that is still taken;
 * 2. `put` — write the rows as they are;
 * 3. `settled` — drop these `syncOutbox` entries, each only if it still has the same `updatedAt` (a newer local
 *    change of the row must stay queued).
 *
 * A removed row whose queue entry is not in `settled` stays queued: an entry without a row is a deletion, the
 * next push sends its tombstone.
 */
export interface SyncPlan {
  put: LocalRow[];
  remove: RowRef[];
  settled: SyncOutboxEntry[];
  conflicts: SyncConflict[];
}

/** `cursor` — the largest `rev` of the applied changes (0 for none): the next `lastPulledRev`, never moved back. */
export interface PullPlan extends SyncPlan {
  cursor: number;
}

const SETTINGS = 'settings';
const MEAL_LOGS = 'mealLogs';

/**
 * The unique indexes of the synced tables besides the primary key (`&date`, `&[programId+date]` in `core/db.ts`):
 * the fields whose values only one live row of the table may hold. IndexedDB refuses a second such row, so a plan
 * never writes one (`applyPull`), and the server does not take one over a row the device has not seen
 * (`sync_unique_key` in `infra/supabase/migrations/`). `uniqueKeys.test.ts` keeps the three lists equal.
 *
 * The «one per day» tables are here although their `id` is made of the same day (ADR-0011): a row without its
 * natural key keeps a random `id`.
 */
export const UNIQUE_KEYS: Readonly<Record<string, readonly string[]>> = {
  sleepLogs: ['date'],
  checkIns: ['date'],
  weightLogs: ['date'],
  plannedSessions: ['programId', 'date'],
};

/**
 * What a row holds of its table's unique key, or `undefined` — the table has none, or a field of the key is not a
 * string or a number (IndexedDB does not index such a row). `fields` — the row or the `data` of its version. Two
 * live rows of one table may not have the same value; the engine reads the stored holders by it for `applyPull`.
 */
export function uniqueKeyOf(table: string, fields: RowData | undefined): string | undefined {
  const names = UNIQUE_KEYS[table];
  if (!names || !fields) return undefined;
  const values = names.map((name) => fields[name]);
  const isIndexed = values.every((value) => typeof value === 'string' || isTime(value));
  return isIndexed ? JSON.stringify(values) : undefined;
}

const keyFieldOf = (table: string): string => (table === SETTINGS ? 'key' : 'id');
const refOf = ({ table, row }: LocalRow): RowRef => ({ table, key: String(row[keyFieldOf(table)]) });
const idOf = ({ table, key }: RowRef): string => `${table}\u0000${key}`;
const isDeviceState = ({ table, key }: RowRef): boolean => table === SETTINGS && isLocalOnlySetting(key);
const isTime = (value: unknown): value is Millis => typeof value === 'number' && Number.isFinite(value);
const isDeleted = (change: SyncChange): boolean => change.deletedAt !== undefined;
const isLive = (local: LocalRow): boolean => !isTime(local.row.deletedAt);

/** The version of a stored row; a row that carries no `updatedAt` (a setting) takes `fallbackTime`. */
function toChange(local: LocalRow, deviceId: string, fallbackTime: Millis): SyncChange {
  const ref = refOf(local);
  const { [keyFieldOf(local.table)]: _key, updatedAt, updatedBy: _updatedBy, deletedAt, ...data } = local.row;
  const version = { ...ref, updatedAt: isTime(updatedAt) ? updatedAt : fallbackTime, updatedBy: deviceId };
  return isTime(deletedAt) ? { ...version, deletedAt } : { ...version, data };
}

function tombstoneOf(ref: RowRef, deviceId: string, at: Millis): SyncChange {
  return { table: ref.table, key: ref.key, updatedAt: at, updatedBy: deviceId, deletedAt: at };
}

/** The row a live version becomes on the device; `updatedBy` names the device that wrote it (ADR-0010, p. 5). */
function toLocalRow(change: SyncChange): LocalRow {
  const { table, key, updatedAt, updatedBy, data } = change;
  return { table, row: { ...data, [keyFieldOf(table)]: key, updatedAt, updatedBy } };
}

/** Last writer wins: the later `updatedAt`, on equal times the greater `updatedBy`. */
function isLater(a: SyncChange, b: SyncChange): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.updatedBy > b.updatedBy);
}

const isSameVersion = (a: SyncChange, b: SyncChange): boolean =>
  a.updatedAt === b.updatedAt && a.updatedBy === b.updatedBy;

/**
 * Resolves a row changed on this device (`localRow`, still in the queue) against the server's version of it.
 *
 * - **Last writer wins** by `updatedAt`, on equal times by `updatedBy`; the same version twice is the server's.
 *   A tombstone is a version like any other: a deletion later than an edit wins, an edit later than a deletion
 *   brings the row back.
 * - **A meal (`mealLogs`) unites its `items` by `id`** instead of dropping one side: an item changed on both
 *   sides is taken with the later item `updatedAt`, a removed item stays in the list as a tombstone (an item with
 *   `deletedAt`), so the union does not bring it back. The other fields come from the later version.
 * - **A deleted meal never beats a live meal of another device.** The two versions were written without knowing
 *   of each other, and a meal tombstone is not «delete this meal with all it holds»: it carries no list of what
 *   its device saw, and the app makes one when the last item the device KNEW is removed (ADR-0011, p. 9). So the
 *   live meal stays, with the items the deleting device has never seen, and the deletion is the change that loses.
 * - Two versions of a meal written by ONE device are not concurrent — the server's is the echo of this device's
 *   own earlier push: the later one wins as it is, nothing is united and its own deletion stands.
 *
 * Returns `localRow` itself (keep it, it is still to be pushed), `remoteRow` itself (the local change lost), or —
 * only for a meal — a NEW version of this device, one millisecond later than both: the union of the items when it
 * differs from both versions, or the local meal when the server's later deletion lost to it. A new version has
 * to be written and pushed, and the server accepts it over the version it holds.
 */
export function merge(localRow: SyncChange, remoteRow: SyncChange): SyncChange {
  const [winner, loser] = isLater(localRow, remoteRow) ? [localRow, remoteRow] : [remoteRow, localRow];
  if (localRow.table !== MEAL_LOGS || localRow.updatedBy === remoteRow.updatedBy) return winner;
  if (!isDeleted(localRow) && !isDeleted(remoteRow)) return unitedMeal(winner, loser, localRow.updatedBy);
  if (isDeleted(localRow)) return isDeleted(remoteRow) ? winner : remoteRow;
  return winner === localRow ? localRow : { ...localRow, updatedAt: remoteRow.updatedAt + 1 };
}

/** Two live versions of a meal: the later one when it already holds every item, or a new version with the union. */
function unitedMeal(winner: SyncChange, loser: SyncChange, deviceId: string): SyncChange {
  const items = uniteItems(itemsOf(winner), itemsOf(loser));
  if (hasSameItems(items, itemsOf(winner))) return winner;
  return {
    table: winner.table,
    key: winner.key,
    updatedAt: winner.updatedAt + 1,
    updatedBy: deviceId,
    data: { ...winner.data, items },
  };
}

/** What the merge reads of a meal item; everything else in it travels untouched. */
interface MergedItem {
  id: string;
  updatedAt: Millis;
  deletedAt?: Millis;
}

/** Items the merge can tell apart; anything else in a broken list is dropped rather than doubled on every merge. */
function itemsOf(change: SyncChange): MergedItem[] {
  const items = change.data?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is MergedItem =>
      typeof item === 'object' && item !== null && typeof item.id === 'string' && isTime(item.updatedAt),
  );
}

/** The winner's items in their order, each in its later version, then the items only the loser has. */
function uniteItems(winner: MergedItem[], loser: MergedItem[]): MergedItem[] {
  const other = new Map(loser.map((item) => [item.id, item]));
  const united = winner.map((item) => {
    const same = other.get(item.id);
    other.delete(item.id);
    return same && same.updatedAt > item.updatedAt ? same : item;
  });
  return [...united, ...other.values()];
}

function hasSameItems(a: MergedItem[], b: MergedItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * The changes to push for the queue (ADR-0009, sync p. 3), oldest change first. `rows` — the stored rows the
 * entries point at, tombstones included (read past the tombstone middleware).
 *
 * - An entry with a live row sends the row. Its time is the row's `updatedAt`; a row without one (a setting
 *   written as `{ key, value }`) takes the entry's.
 * - An entry with a tombstone sends the tombstone: key and times, no content.
 * - An entry with no row is a physical deletion (ADR-0010, p. 3): a tombstone at the entry's time.
 * - Device state (`localOnly.ts`) is never sent.
 *
 * Every change is this device's write: `updatedBy` is `deviceId` — the third argument, because a stored row does
 * not name its device (ADR-0010, p. 5: `updatedBy` is filled in by the sync layer) and a pure function cannot
 * read `device.id` itself. The transport splits the list into batches.
 */
export function buildPush(
  outbox: readonly SyncOutboxEntry[],
  rows: readonly LocalRow[],
  { deviceId }: { deviceId: string },
): SyncChange[] {
  const stored = indexRows(rows);
  return outbox
    .filter((entry) => !isDeviceState(entry))
    .toSorted((a, b) => a.updatedAt - b.updatedAt || compareText(idOf(a), idOf(b)))
    .map((entry) => localVersion(stored.get(idOf(entry)), entry, deviceId));
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const indexRows = (rows: readonly LocalRow[]) => new Map(rows.map((row) => [idOf(refOf(row)), row]));

/** The version of a queued row as this device holds it: the row, its tombstone, or — no row at all — a deletion. */
function localVersion(row: LocalRow | undefined, entry: SyncOutboxEntry, deviceId: string): SyncChange {
  return row ? toChange(row, deviceId, entry.updatedAt) : tombstoneOf(entry, deviceId, entry.updatedAt);
}

/**
 * What to do with changes pulled from the server (ADR-0009, sync p. 4–5). `local.rows` — the stored rows of the
 * changed keys (tombstones included) and the stored rows that hold the unique keys of the changes
 * (`uniqueKeyOf`); `local.outbox` — the queue.
 *
 * - A row without a queue entry has no local change: the server's version replaces it. A server tombstone removes
 *   a live row physically; a tombstone this device made itself (`softDelete`) is left for the engine's clean-up
 *   (ADR-0010: not before the server's tombstone has expired).
 * - A row with a queue entry is resolved by `merge`: the local version stays queued; or the server's replaces it
 *   — the entry is settled and the lost local version is reported in `conflicts` (not when both are the same
 *   version — the echo of this device's own push — or both are deletions: nothing is lost then); or a new
 *   version of a meal is written and stays queued.
 * - **A unique key that is not the primary key** (`UNIQUE_KEYS`, e.g. one session of a program per day): the
 *   server's row takes it, another local row that holds it gives way — it is removed first. Without a queue
 *   entry that row has no local change: the server has moved or deleted it, and its own change, if any, writes it
 *   again (it comes with a later `rev`, in this page or a later one). With a queue entry its local change loses
 *   the key: the version is reported in `conflicts` and the entry stays, so the row goes to the server as a
 *   deletion — the server never keeps two live rows of one key, and every device ends with the same rows.
 * - Device state (`localOnly.ts`) is never taken from the server.
 *
 * Changes are applied in the order of `rev`.
 */
export function applyPull(changes: readonly PulledChange[], local: LocalState): PullPlan {
  const device = deviceImage(local.rows);
  const queue = new Map(local.outbox.map((entry) => [idOf(entry), entry]));
  const plan: PullPlan = { put: [], remove: [], settled: [], conflicts: [], cursor: 0 };

  for (const remote of changes.toSorted((a, b) => a.rev - b.rev)) {
    plan.cursor = Math.max(plan.cursor, remote.rev);
    if (isDeviceState(remote)) continue;
    const id = idOf(remote);
    const stored = device.rows.get(id);
    const queued = queue.get(id);
    let version: SyncChange = remote;
    if (queued) {
      const mine = localVersion(stored, queued, local.deviceId);
      version = merge(mine, remote);
      if (version === mine) continue;
      if (version === remote) {
        queue.delete(id);
        plan.settled.push(queued);
        const isLost = !isSameVersion(mine, remote) && !(isDeleted(mine) && isDeleted(remote));
        if (isLost) plan.conflicts.push({ local: mine, remote });
      }
    }
    if (isDeleted(version)) {
      if (stored && isLive(stored)) device.remove(remote);
      continue;
    }
    const row = toLocalRow(version);
    const holder = device.holderOfKeyOf(row);
    if (holder) {
      const pending = queue.get(idOf(refOf(holder)));
      if (pending) plan.conflicts.push({ local: toChange(holder, local.deviceId, pending.updatedAt), remote });
      device.remove(refOf(holder));
    }
    device.put(row);
  }

  plan.put = device.written();
  plan.remove = device.removed();
  return plan;
}

/**
 * The device's rows as a plan leaves them: `applyPull` reads them and writes to them change by change, so a later
 * change of a page sees what an earlier one did. Keeps track of which live row holds which unique key.
 */
function deviceImage(stored: readonly LocalRow[]) {
  const rows = indexRows(stored);
  const holders = new Map<string, string>();
  const put = new Map<string, LocalRow>();
  const remove = new Map<string, RowRef>();

  const keyHeldBy = (row: LocalRow | undefined): string | undefined => {
    const unique = row && isLive(row) ? uniqueKeyOf(row.table, row.row) : undefined;
    return row && unique !== undefined ? idOf({ table: row.table, key: unique }) : undefined;
  };
  const release = (id: string): void => {
    const held = keyHeldBy(rows.get(id));
    if (held !== undefined && holders.get(held) === id) holders.delete(held);
  };
  for (const [id, row] of rows) {
    const held = keyHeldBy(row);
    if (held !== undefined) holders.set(held, id);
  }

  return {
    rows: rows as ReadonlyMap<string, LocalRow>,
    /** Another live row that holds the unique key this row is about to take. */
    holderOfKeyOf(row: LocalRow): LocalRow | undefined {
      const held = keyHeldBy(row);
      const holder = held === undefined ? undefined : holders.get(held);
      return holder === undefined || holder === idOf(refOf(row)) ? undefined : rows.get(holder);
    },
    put(row: LocalRow): void {
      const id = idOf(refOf(row));
      release(id);
      rows.set(id, row);
      put.set(id, row);
      const held = keyHeldBy(row);
      if (held !== undefined) holders.set(held, id);
    },
    remove(ref: RowRef): void {
      const id = idOf(ref);
      release(id);
      rows.delete(id);
      put.delete(id);
      remove.set(id, { table: ref.table, key: ref.key });
    },
    written: (): LocalRow[] => [...put.values()],
    removed: (): RowRef[] => [...remove.values()],
  };
}

/**
 * What to do with the server's answer to a push. `local` — the state the push was built from; its rows, as for
 * `applyPull`, include the holders of the unique keys of the versions that came back.
 *
 * - An accepted change is settled: its queue entry goes (if the row was not changed again meanwhile — see
 *   `SyncPlan.settled`).
 * - A change the server did not take (it holds a later version, e.g. this device's clock is behind) comes back
 *   with the server's version, which is applied exactly like a pulled one: the local change loses and is reported
 *   in `conflicts`, or a meal is merged and stays queued. The device never waits for a pull that would not bring
 *   that version again.
 * - A change that comes back without a version (its unique key is held by a row this device has not seen, and the
 *   server has no version of the row) stays queued: the pull that follows brings the holder (`applyPull`).
 */
export function applyPushResult(results: readonly PushResult[], local: LocalState): SyncPlan {
  const queue = new Map(local.outbox.map((entry) => [idOf(entry), entry]));
  const accepted = results.flatMap((result) => (result.applied ? (queue.get(idOf(result)) ?? []) : []));
  const kept = results.flatMap((result) => (!result.applied && result.current ? result.current : []));
  const { put, remove, settled, conflicts } = applyPull(kept, local);
  return { put, remove, settled: [...accepted, ...settled], conflicts };
}

/**
 * Whether the device has been away for longer than the server keeps tombstones (ADR-0009, sync p. 6): then an
 * ordinary pull would never tell it what was deleted meanwhile. The engine pushes the whole queue, pulls
 * everything from `rev` 0 and removes what `staleAfterFullPull` names. A device that has never synced has
 * nothing stale: its first sync is an ordinary one.
 */
export function isFullSyncDue(lastSyncedAt: Millis | undefined, now: Millis): boolean {
  return lastSyncedAt !== undefined && now - lastSyncedAt > TOMBSTONE_TTL_MS;
}

/**
 * After the full pull of a device that was away for too long: the rows it still holds that the server no longer
 * knows and that are not queued. They were deleted on another device and the tombstone has expired — keeping
 * them would bring the deleted records back. `server` — everything the full pull returned; `local.rows` — all
 * stored rows of the device. Device state stays.
 */
export function staleAfterFullPull(server: readonly RowRef[], local: LocalState): RowRef[] {
  const known = new Set([...server, ...local.outbox].map(idOf));
  return local.rows.map(refOf).filter((ref) => !isDeviceState(ref) && !known.has(idOf(ref)));
}

/**
 * «Replace the data in the cloud» — restoring a backup with an account on (ADR-0009, sync p. 9). The changes
 * that make the server hold exactly what the device holds; the transport sends them with `replace: true`, so the
 * server takes them over later versions too.
 *
 * - every stored row of the device goes as it is, with its own `updatedAt` (a setting without one — `now`);
 * - every live row of the server that the device does not hold gets a tombstone at `now`.
 *
 * `server` — a full pull (from `rev` 0); `rows` — all stored rows of the device. Device state is left out.
 */
export function buildReplace(
  server: readonly SyncChange[],
  rows: readonly LocalRow[],
  { deviceId, now }: { deviceId: string; now: Millis },
): SyncChange[] {
  const mine = rows.filter((row) => !isDeviceState(refOf(row)));
  const held = new Set(mine.map((row) => idOf(refOf(row))));
  const missing = server.filter(
    (remote) => remote.deletedAt === undefined && !isDeviceState(remote) && !held.has(idOf(remote)),
  );
  return [
    ...mine.map((row) => toChange(row, deviceId, now)),
    ...missing.map((remote) => tombstoneOf(remote, deviceId, now)),
  ];
}
