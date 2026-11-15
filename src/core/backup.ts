import { db, TABLE_NAMES, type TableName } from './db';
import { SCHEMA_VERSION } from './schemaVersion';
import { DEVICE_ID_KEY } from './sync/localOnly';

export const BACKUP_FORMAT = 'lifeos-backup';
/**
 * A backup carries the schema version of the app that made it (`core/schemaVersion.ts`). Backups made before
 * contract #274 carry `1`; the schema only grows, so every older backup is still importable.
 */
export const BACKUP_VERSION = SCHEMA_VERSION;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  tables: Record<TableName, unknown[]>;
}

const field = (row: unknown, name: string): unknown =>
  typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[name] : undefined;

/** `settings` `device.id` identifies the installation: it is never written to a backup nor taken from one. */
const isDeviceId = (table: TableName, row: unknown): boolean =>
  table === 'settings' && field(row, 'key') === DEVICE_ID_KEY;

/**
 * Dumps every data table to a plain JSON-serializable object: what the user sees, and nothing about the sync.
 * Not in a backup: records deleted with `softDelete` (reads through `db` skip them), the `syncOutbox` queue
 * (it is not in `TABLE_NAMES`) and `device.id`. The other device-state keys of `settings` are exported, so a
 * restore on the same phone does not, for example, show onboarding again.
 */
export async function exportAll(now: number = Date.now()): Promise<Backup> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (name) => {
      const rows: unknown[] = await db.table(name).toArray();
      return [name, rows.filter((row) => !isDeviceId(name, row))] as const;
    }),
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    tables: Object.fromEntries(entries) as Record<TableName, unknown[]>,
  };
}

export function isBackup(value: unknown): value is Backup {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Backup>;
  return (
    v.format === BACKUP_FORMAT && typeof v.version === 'number' && typeof v.tables === 'object' && v.tables !== null
  );
}

/**
 * Replaces ALL local data with the backup, atomically.
 * Unknown tables in the backup are ignored; tables missing from it are cleared.
 * Accepts backups of this schema version and of any older one; a backup from a newer app is refused.
 *
 * Sync (ADR-0009): `clear()` removes tombstones too, so nothing deleted before the import survives it. This
 * device keeps its `device.id` — an id inside the file is ignored, as are rows marked `deletedAt` (a backup is
 * live data). The core middleware queues every removed and every restored row in `syncOutbox`: with an account, a
 * restore is «replace the data in the cloud» (sync p. 9).
 */
export async function importAll(backup: unknown): Promise<void> {
  if (!isBackup(backup)) throw new Error('Файл не похож на резервную копию LifeOS');
  if (backup.version > SCHEMA_VERSION) throw new Error('Резервная копия из более новой версии приложения');
  await db.transaction(
    'rw',
    TABLE_NAMES.map((n) => db.table(n)),
    async () => {
      const deviceId = await db.settings.get(DEVICE_ID_KEY);
      for (const name of TABLE_NAMES) {
        const table = db.table(name);
        await table.clear();
        const given: unknown = backup.tables[name];
        const rows = Array.isArray(given)
          ? given.filter((row) => !isDeviceId(name, row) && field(row, 'deletedAt') == null)
          : [];
        if (rows.length) await table.bulkAdd(rows);
      }
      if (deviceId) await db.settings.put(deviceId);
    },
  );
}
