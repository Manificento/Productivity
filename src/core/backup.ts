import { db, TABLE_NAMES, type TableName } from './db';
import { SCHEMA_VERSION } from './schemaVersion';

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

/** Dumps every table to a plain JSON-serializable object. */
export async function exportAll(now: number = Date.now()): Promise<Backup> {
  const entries = await Promise.all(TABLE_NAMES.map(async (name) => [name, await db.table(name).toArray()] as const));
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
 */
export async function importAll(backup: unknown): Promise<void> {
  if (!isBackup(backup)) throw new Error('Файл не похож на резервную копию LifeOS');
  if (backup.version > SCHEMA_VERSION) throw new Error('Резервная копия из более новой версии приложения');
  await db.transaction(
    'rw',
    TABLE_NAMES.map((n) => db.table(n)),
    async () => {
      for (const name of TABLE_NAMES) {
        const table = db.table(name);
        await table.clear();
        const rows = backup.tables[name];
        if (Array.isArray(rows) && rows.length) await table.bulkAdd(rows);
      }
    },
  );
}
