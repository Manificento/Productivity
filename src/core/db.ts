import Dexie, { type EntityTable } from 'dexie';
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

  constructor(name = 'lifeos') {
    super(name);
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
  }
}

export const db = new LifeDB();

/** Table names, used by backup. Keep in sync with the stores above. */
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
