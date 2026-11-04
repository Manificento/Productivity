import { BACKUP_FORMAT, BACKUP_VERSION, importAll, type Backup } from '../../../core/backup';
import { db, TABLE_NAMES } from '../../../core/db';
import type { DateKey } from '../../../core/types';
import { buildDemoTables } from '../logic/demo';

/** Whether any table holds data — then loading the demo would replace the user's own records. */
export async function hasUserData(): Promise<boolean> {
  const counts = await Promise.all(TABLE_NAMES.map((name) => db.table(name).count()));
  return counts.some((n) => n > 0);
}

/** Replaces ALL data with the demo, through the same atomic path as a backup import. */
export async function loadDemoData(today: DateKey, now: number = Date.now()): Promise<void> {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    tables: buildDemoTables(today, now),
  };
  await importAll(backup);
}
