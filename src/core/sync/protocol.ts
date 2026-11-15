import type { Millis, SyncOutboxEntry } from '../types';
import { isLocalOnlySetting } from './localOnly';

/**
 * The sync protocol as pure functions (ADR-0009 «Синхронизация», ADR-0012): no React, no Dexie, no network, no
 * clock. The engine (Dexie + network) reads the local state, calls these functions and executes the plans they
 * return; the transport is `client.ts`, the server side is `infra/supabase/migrations/`.
 *
 *   push:  buildPush(outbox, rows)        → changes for the server → applyPushResult(results, local) → plan
 *   pull:  changes from the server        → applyPull(changes, local)                               → plan
 *   both resolve a row changed on both sides with merge(localRow, remoteRow)
 *
 * The one rule behind every plan: **a row with no entry in `syncOutbox` has no local change, so the server's
 * version replaces it; a row with an entry is merged** — last writer wins by `updatedAt`, then by `updatedBy`;
 * a meal (`mealLogs`) unites its `items` by `id`.
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
  /** `false`: the server holds a later version and kept it — it comes in `current`. */
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
 * outbox middleware does not queue these writes again (ADR-0010):
 * - `put` — write the rows as they are;
 * - `remove` — delete the rows physically (the server says they are deleted; nothing is left to send);
 * - `settled` — drop these `syncOutbox` entries, each only if it still has the same `updatedAt` (a newer local
 *   change of the row must stay queued).
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

const keyFieldOf = (table: string): string => (table === SETTINGS ? 'key' : 'id');
const refOf = ({ table, row }: LocalRow): RowRef => ({ table, key: String(row[keyFieldOf(table)]) });
const idOf = ({ table, key }: RowRef): string => `${table}\u0000${key}`;
const isDeviceState = ({ table, key }: RowRef): boolean => table === SETTINGS && isLocalOnlySetting(key);
const isTime = (value: unknown): value is Millis => typeof value === 'number' && Number.isFinite(value);

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
 *
 * Returns `localRow` itself (keep it, it is still to be pushed), `remoteRow` itself (the local change lost), or —
 * only for a meal whose union differs from both — a NEW version of this device, one millisecond later than both:
 * it has to be written and pushed, and the server accepts it over the version it holds.
 */
export function merge(localRow: SyncChange, remoteRow: SyncChange): SyncChange {
  const [winner, loser] = isLater(localRow, remoteRow) ? [localRow, remoteRow] : [remoteRow, localRow];
  if (localRow.table !== MEAL_LOGS || winner.deletedAt !== undefined || loser.deletedAt !== undefined) return winner;

  const items = uniteItems(itemsOf(winner), itemsOf(loser));
  if (hasSameItems(items, itemsOf(winner))) return winner;
  return {
    table: winner.table,
    key: winner.key,
    updatedAt: winner.updatedAt + 1,
    updatedBy: localRow.updatedBy,
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
 * Every change is this device's write: `updatedBy` is `deviceId`. The transport splits the list into batches.
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
 * changed keys (tombstones included), `local.outbox` — the queue.
 *
 * - A row without a queue entry has no local change: the server's version replaces it. A server tombstone removes
 *   a live row physically; a tombstone this device made itself (`softDelete`) is left for the engine's clean-up
 *   (ADR-0010: not before the server's tombstone has expired).
 * - A row with a queue entry is resolved by `merge`: the local version stays queued; or the server's replaces it
 *   — the entry is settled and, unless both are the same version (the echo of this device's own push), the lost
 *   local version is reported in `conflicts`; or a merged meal is written and stays queued.
 * - Device state (`localOnly.ts`) is never taken from the server.
 *
 * Changes are applied in the order of `rev`.
 */
export function applyPull(changes: readonly PulledChange[], local: LocalState): PullPlan {
  const rows = indexRows(local.rows);
  const queue = new Map(local.outbox.map((entry) => [idOf(entry), entry]));
  const writes = new Map<string, { put: LocalRow } | { remove: RowRef }>();
  const plan: PullPlan = { put: [], remove: [], settled: [], conflicts: [], cursor: 0 };

  for (const remote of changes.toSorted((a, b) => a.rev - b.rev)) {
    plan.cursor = Math.max(plan.cursor, remote.rev);
    if (isDeviceState(remote)) continue;
    const id = idOf(remote);
    const stored = rows.get(id);
    const queued = queue.get(id);
    let version: SyncChange = remote;
    if (queued) {
      const mine = localVersion(stored, queued, local.deviceId);
      version = merge(mine, remote);
      if (version === mine) continue;
      if (version === remote) {
        queue.delete(id);
        plan.settled.push(queued);
        if (!isSameVersion(mine, remote)) plan.conflicts.push({ local: mine, remote });
      }
    }
    if (version.deletedAt === undefined) {
      const row = toLocalRow(version);
      rows.set(id, row);
      writes.set(id, { put: row });
    } else if (stored && !isTime(stored.row.deletedAt)) {
      rows.delete(id);
      writes.set(id, { remove: { table: remote.table, key: remote.key } });
    }
  }

  for (const write of writes.values()) {
    if ('put' in write) plan.put.push(write.put);
    else plan.remove.push(write.remove);
  }
  return plan;
}

/**
 * What to do with the server's answer to a push. `local` — the state the push was built from.
 *
 * - An accepted change is settled: its queue entry goes (if the row was not changed again meanwhile — see
 *   `SyncPlan.settled`).
 * - A change the server did not take (it holds a later version, e.g. this device's clock is behind) comes back
 *   with the server's version, which is applied exactly like a pulled one: the local change loses and is reported
 *   in `conflicts`, or a meal is merged and stays queued. The device never waits for a pull that would not bring
 *   that version again.
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
