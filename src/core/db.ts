import Dexie, { type EntityTable, type Table } from 'dexie';
import { newId } from './ids';
import { SCHEMA_VERSION } from './schemaVersion';
import { DEVICE_ID_KEY, isLocalOnlySetting } from './sync/localOnly';
import { outboxMiddleware } from './sync/outbox';
import { tombstoneMiddleware } from './sync/tombstones';
import type {
  CheckIn,
  CognitiveTest,
  Food,
  Habit,
  HabitLog,
  LifeEvent,
  MealLog,
  MeditationSession,
  MindSession,
  Note,
  PlannedSession,
  Program,
  Project,
  Setting,
  SleepLog,
  SyncOutboxEntry,
  Task,
  TimeCategory,
  TimeEntry,
  WeightLog,
  WorkoutLog,
  XpEvent,
} from './types';

/**
 * The single local database. ALL tables for ALL modules are declared here up front,
 * so modules can be built in parallel without editing this file. Versions are append-only.
 *
 * Index strings list only the fields used in queries; other fields are stored anyway.
 * To add an index: bump the version with a new `this.version(n).stores(...)` call
 * (never edit an existing version) — see CLAUDE.md "Contract changes".
 */
export class LifeDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitLogs!: EntityTable<HabitLog, 'id'>;
  timeCategories!: EntityTable<TimeCategory, 'id'>;
  timeEntries!: EntityTable<TimeEntry, 'id'>;
  sleepLogs!: EntityTable<SleepLog, 'id'>;
  foods!: EntityTable<Food, 'id'>;
  mealLogs!: EntityTable<MealLog, 'id'>;
  workoutLogs!: EntityTable<WorkoutLog, 'id'>;
  checkIns!: EntityTable<CheckIn, 'id'>;
  cognitiveTests!: EntityTable<CognitiveTest, 'id'>;
  lifeEvents!: EntityTable<LifeEvent, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  weightLogs!: EntityTable<WeightLog, 'id'>;
  programs!: EntityTable<Program, 'id'>;
  plannedSessions!: EntityTable<PlannedSession, 'id'>;
  meditationSessions!: EntityTable<MeditationSession, 'id'>;
  mindSessions!: EntityTable<MindSession, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  xpEvents!: EntityTable<XpEvent, 'id'>;
  /** Outgoing sync queue — written only by the core middleware, read only by the sync layer (`core/sync/`). */
  syncOutbox!: Table<SyncOutboxEntry, [table: string, key: string]>;

  constructor(name = 'lifeos') {
    super(name);
    // Core middlewares (ADR-0009): changed rows go to `syncOutbox`; rows removed with `softDelete` are hidden.
    this.use(outboxMiddleware);
    this.use(tombstoneMiddleware);
    this.version(1).stores({
      projects: 'id, archived',
      tasks: 'id, projectId, dueDate, priority, completedAt, *tags',
      habits: 'id, archived',
      habitLogs: 'id, habitId, date, [habitId+date]',
      timeCategories: 'id, archived',
      timeEntries: 'id, categoryId, taskId, date, start',
      sleepLogs: 'id, &date',
      foods: 'id, name, externalId',
      mealLogs: 'id, date',
      workoutLogs: 'id, date',
      checkIns: 'id, &date',
      lifeEvents: 'id, date, projectId',
      settings: 'key',
    });
    // v2 (contract C1): cognitive tests for the `cognition` module.
    this.version(2).stores({
      cognitiveTests: 'id, date, kind, [kind+date]',
    });
    // v3 (contract C3, SPEC 0.3 §5.6): tables of the nutrition, training, meditation, cognition
    // (mind trainers), notes and progress blocks.
    this.version(3).stores({
      weightLogs: 'id, &date',
      programs: 'id',
      plannedSessions: 'id, &[programId+date], date',
      meditationSessions: 'id, date',
      mindSessions: 'id, date, kind',
      notes: 'id, updatedAt, *linkIds',
      xpEvents: 'id, date, source',
    });
    // v4 (contract #150): re-import of tasks finds them by source + external id.
    this.version(4).stores({
      tasks: 'id, projectId, dueDate, priority, completedAt, *tags, [source+externalId]',
    });
    // v5 (contract #215): re-import of workouts from Health Connect / HealthKit finds them by source + external id.
    this.version(5).stores({
      workoutLogs: 'id, date, [sourceId+externalId]',
    });
    // v6 (contract #227): re-import of a night (Sleep Cycle, Health) finds it by source + external id.
    this.version(6).stores({
      sleepLogs: 'id, &date, [sourceId+externalId]',
    });
    // v7 (contract #274, ADR-0009): the outgoing sync queue, one entry per changed row; pushed oldest first.
    this.version(7).stores({
      syncOutbox: '[table+key], updatedAt',
    });
    // Versions above stay literal (append-only: a constant there would silently renumber the last one).
    // SCHEMA_VERSION must name the newest of them — backups and the sync protocol speak this number.
    if (this.verno !== SCHEMA_VERSION) {
      throw new Error(`SCHEMA_VERSION (${SCHEMA_VERSION}) must equal the newest Dexie version (${this.verno})`);
    }
    // Every start: the installation has its id before the app's first query (first open and after an upgrade).
    this.on('ready', (vip) => ensureDeviceId(vip as LifeDB));
  }
}

/** Reads `device.id`, creating it when missing. The second read under a write lock keeps two tabs on one id. */
function ensureDeviceId(database: LifeDB): PromiseLike<string> {
  const idOf = (row: Setting | undefined) => (typeof row?.value === 'string' && row.value ? row.value : undefined);
  const { settings } = database;
  return settings.get(DEVICE_ID_KEY).then(
    (row) =>
      idOf(row) ??
      database.transaction('rw', settings, () =>
        settings.get(DEVICE_ID_KEY).then((again) => {
          const kept = idOf(again);
          if (kept) return kept;
          const id = newId();
          return settings.put({ key: DEVICE_ID_KEY, value: id }).then(() => id);
        }),
      ),
  );
}

export const db = new LifeDB();

/**
 * UUID of this installation (`settings` `device.id`) — the `updated_by` of what this device pushes (ADR-0009).
 * Created when the database is first opened; device state: never synced, never exported, kept by `importAll`.
 */
export async function getDeviceId(): Promise<string> {
  return ensureDeviceId(db);
}

/**
 * Deletes a record the way the sync needs it (ADR-0009, sync p. 2): the row stays with `deletedAt` (a tombstone)
 * and a bumped `updatedAt`, and from then on no read through `db` returns it. Modules call this INSTEAD of
 * `table.delete()` — a physical delete in a module fails `core/softDelete.guard.test.ts`.
 *
 * Works inside the module's own transaction. Deleting a missing or already deleted record does nothing.
 * A device-state key of `settings` (`core/sync/localOnly.ts`) is never synced, so it is removed for real.
 *
 *   await softDelete(db.tasks, id);
 */
export function softDelete<K>(table: Table<any, K, any>, id: K, now: number = Date.now()): Promise<void> {
  return softDeleteMany(table, [id], now);
}

/** `softDelete()` for several records of one table (instead of `bulkDelete` or a `where(…).delete()`). */
export async function softDeleteMany<K>(
  table: Table<any, K, any>,
  ids: readonly K[],
  now: number = Date.now(),
): Promise<void> {
  const localOnly = table.name === 'settings' ? ids.filter(isLocalOnlySetting) : [];
  const synced = ids.filter((id) => !localOnly.includes(id));
  if (localOnly.length > 0) await table.bulkDelete(localOnly);
  if (synced.length > 0) {
    await table.bulkUpdate(synced.map((key) => ({ key, changes: { deletedAt: now, updatedAt: now } })));
  }
}

/**
 * Names of the DATA tables, used by backup. Keep in sync with the stores above.
 * `syncOutbox` is deliberately not here: it is the device's sync queue, not data to export or import.
 */
export const TABLE_NAMES = [
  'projects',
  'tasks',
  'habits',
  'habitLogs',
  'timeCategories',
  'timeEntries',
  'sleepLogs',
  'foods',
  'mealLogs',
  'workoutLogs',
  'checkIns',
  'cognitiveTests',
  'lifeEvents',
  'settings',
  'weightLogs',
  'programs',
  'plannedSessions',
  'meditationSessions',
  'mindSessions',
  'notes',
  'xpEvents',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];
