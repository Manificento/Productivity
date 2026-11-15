/**
 * The one version of the local data schema (ADR-0009, sync p. 8).
 *
 * It is the newest Dexie version in `core/db.ts`, the version written into a backup (`BACKUP_VERSION`) and the
 * `schemaVersion` the client will send to the sync server. Bump it together with a new `this.version(n).stores(…)`
 * in `core/db.ts` — the database refuses to start when the two differ.
 *
 * Schema changes are additive only (new tables, indexes and optional fields), so data of an older version is
 * always readable by a newer app; the reverse is refused (`importAll`, later the sync server).
 */
export const SCHEMA_VERSION = 7;
