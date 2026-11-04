import { BACKUP_FORMAT, BACKUP_VERSION, importAll, type Backup } from '../../../core/backup';
import { db, TABLE_NAMES, type TableName } from '../../../core/db';
import type { DateKey } from '../../../core/types';
import { buildDemoTables } from '../logic/demo';

/** Tables the demo replaces: everything except preferences (`settings` — theme, normal routine). */
const DATA_TABLES = TABLE_NAMES.filter((name) => name !== 'settings');

/**
 * Every table, empty — only to satisfy `Backup.tables` (`Record<TableName, unknown[]>`): `importAll` clears a table
 * missing from the backup anyway, so the tables of blocks the demo does not fill yet (SPEC 0.3) end up empty either way.
 */
function emptyTables(): Record<TableName, unknown[]> {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, [] as unknown[]])) as Record<TableName, unknown[]>;
}

/** Whether any data table holds records — then loading the demo would replace the user's own records. */
export async function hasUserData(): Promise<boolean> {
  const counts = await Promise.all(DATA_TABLES.map((name) => db.table(name).count()));
  return counts.some((n) => n > 0);
}

/**
 * Replaces all data with the demo, through the same atomic path as a backup import.
 * The user's own settings (theme, normal routine) are carried over unchanged.
 */
export async function loadDemoData(today: DateKey, now: number = Date.now()): Promise<void> {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    tables: { ...emptyTables(), ...buildDemoTables(today, now), settings: await db.settings.toArray() },
  };
  await importAll(backup);
}
