import type { BaseRecord } from './types';

export function newId(): string {
  return crypto.randomUUID();
}

/** Fills id/createdAt/updatedAt for a new record. */
export function newRecord<T extends object>(data: T, now: number = Date.now()): T & BaseRecord {
  return { ...data, id: newId(), createdAt: now, updatedAt: now };
}

/** Bumps updatedAt on a patch. */
export function touch<T extends object>(patch: T, now: number = Date.now()): T & { updatedAt: number } {
  return { ...patch, updatedAt: now };
}
