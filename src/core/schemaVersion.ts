/**
 * The one version of the local data schema (ADR-0009, sync p. 8).
 *
 * It is the newest Dexie version in `core/db.ts`, the version written into a backup (`BACKUP_VERSION`) and the
 * `schemaVersion` the client will send to the sync server. Bump it together with a new `this.version(n).stores(…)`
 * in `core/db.ts` — the database refuses to start when the two differ.
 *
 * Schema changes are additive only (new tables, indexes and optional fields), so data of an older version is
 * always readable by a newer app; the reverse is refused (`importAll`, later the sync server).
 *
 * 8 (contract #275) changed no store: it moved the «one per day» records under `naturalId(…)` and gave meal items
 * ids. Older data gets the same treatment wherever it enters — the Dexie upgrade and `importAll`.
 */
export const SCHEMA_VERSION = 8;
