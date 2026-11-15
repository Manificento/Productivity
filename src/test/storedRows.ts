import Dexie from 'dexie';
import { db } from '../core/db';

/**
 * What IndexedDB really holds in a table — read through a plain connection, without the core middlewares.
 * `db` hides rows removed with `softDelete()`; a test that must see the tombstone itself reads it here.
 */
export async function storedRows<T = Record<string, unknown>>(table: string): Promise<T[]> {
  const raw = new Dexie(db.name);
  await raw.open();
  try {
    return (await raw.table(table).toArray()) as T[];
  } finally {
    raw.close();
  }
}
