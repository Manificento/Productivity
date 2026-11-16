import { db, TABLE_NAMES, type TableName } from './db';
import { SCHEMA_VERSION } from './schemaVersion';
import { INSTALLATION_SETTING_KEYS, isInstallationSetting } from './sync/localOnly';
import { isNaturalKeyTable, withNaturalIds } from './sync/naturalKeys';

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

/**
 * `settings` keys of the installation (`device.id`, the account's session with its tokens and the cached consents)
 * are never written to a backup nor taken from one: a backup is a file the user may send anywhere.
 */
const isOfInstallation = (table: TableName, row: unknown): boolean =>
  table === 'settings' && isInstallationSetting(field(row, 'key'));

/**
 * Dumps every data table to a plain JSON-serializable object: what the user sees, and nothing about the sync.
 * Not in a backup: records deleted with `softDelete` (reads through `db` skip them), the `syncOutbox` queue
 * (it is not in `TABLE_NAMES`) and the keys of the installation — `device.id`, `account.session`,
 * `account.consents`. The other device-state keys of `settings` are exported, so a restore on the same phone does
 * not, for example, show onboarding again.
 */
export async function exportAll(now: number = Date.now()): Promise<Backup> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (name) => {
      const rows: unknown[] = await db.table(name).toArray();
      return [name, rows.filter((row) => !isOfInstallation(name, row))] as const;
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
 * Sync (ADR-0009): `clear()` removes tombstones too, so no trace of what was deleted before the import survives it. This
 * device keeps its `device.id` and its account (session, cached consents) — such keys inside the file are ignored,
 * as are rows marked `deletedAt` (a backup is live data). The core middleware queues every removed and every
 * restored row in `syncOutbox`: with an account, a restore is «replace the data in the cloud» (sync p. 9).
 *
 * Natural ids (#275): a backup made before schema version 8 holds the «one per day» records under random ids and
 * meal items without ids. Their rows go through the same `withNaturalIds` as the Dexie migration — whatever the
 * version of the file says (it changes nothing in rows that are already right), so the database never holds such a
 * record under another id.
 */
export async function importAll(backup: unknown): Promise<void> {
  if (!isBackup(backup)) throw new Error('Файл не похож на резервную копию LifeOS');
  if (backup.version > SCHEMA_VERSION) {
    throw new Error('Резервная копия сделана в более новой версии приложения. Обновите приложение и повторите импорт');
  }
  await db.transaction(
    'rw',
    TABLE_NAMES.map((n) => db.table(n)),
    async () => {
      const ofInstallation = (await db.settings.bulkGet([...INSTALLATION_SETTING_KEYS])).filter(
        (row) => row !== undefined,
      );
      for (const name of TABLE_NAMES) {
        const table = db.table(name);
        await table.clear();
        const given: unknown = backup.tables[name];
        const live = Array.isArray(given)
          ? given.filter((row) => !isOfInstallation(name, row) && field(row, 'deletedAt') == null)
          : [];
        const rows = isNaturalKeyTable(name) ? withNaturalIds(name, live) : live;
        if (rows.length) await table.bulkAdd(rows);
      }
      if (ofInstallation.length) await db.settings.bulkPut(ofInstallation);
    },
  );
}
