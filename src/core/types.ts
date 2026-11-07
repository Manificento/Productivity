/**
 * Shared domain types — the contract between all modules.
 * Changing a type here affects every module: see CLAUDE.md "Contract changes".
 *
 * Conventions:
 * - `id` is a string from `newId()`.
 * - `DateKey` is a local calendar day 'YYYY-MM-DD' (see core/dates.ts). Never use UTC dates for days.
 * - Timestamps are epoch milliseconds (number).
 * - Every record has createdAt/updatedAt for future sync.
 */

export type Id = string;
/** Local calendar day, 'YYYY-MM-DD'. */
export type DateKey = string;
/** Epoch milliseconds. */
export type Millis = number;

export interface BaseRecord {
  id: Id;
  createdAt: Millis;
  updatedAt: Millis;
}

// ---------- tasks ----------

export type Priority = 1 | 2 | 3 | 4; // 1 = highest

export interface Recurrence {
  /** 'daily' | 'weekly' (on `weekdays`) | 'monthly' (on `dayOfMonth`, else the due date's day) | every N days */
  kind: 'daily' | 'weekly' | 'monthly' | 'everyNDays';
  /** 0 = Sunday … 6 = Saturday; used when kind = 'weekly'. */
  weekdays?: number[];
  /** Used when kind = 'everyNDays'. */
  interval?: number;
  /**
   * Anchor day 1…31 for kind = 'monthly': the repeat returns to it after a short month (31 Jan → 28 Feb →
   * 31 Mar). Records without it repeat on the due date's day.
   */
  dayOfMonth?: number;
}

export interface Project extends BaseRecord {
  name: string;
  color?: string;
  archived: boolean;
}

export interface Task extends BaseRecord {
  title: string;
  notes?: string;
  projectId?: Id;
  priority: Priority;
  /** Day the task is due (local). */
  dueDate?: DateKey;
  /** 'HH:mm' local time, only meaningful with dueDate. */
  dueTime?: string;
  /** Estimated minutes, used for day capacity. */
  estimateMin?: number;
  tags: string[];
  recurrence?: Recurrence;
  completedAt?: Millis;
  /** Where an imported task came from; absent for tasks created in the app. */
  source?: TaskSource;
  /** Id in the source system; with `source` it keys the upsert on re-import (`[source+externalId]`). */
  externalId?: string;
}

/** Import sources that `core/logging/importTasks` accepts. */
export type TaskSource = 'todoist' | 'other';

// ---------- habits ----------

export interface HabitSchedule {
  kind: 'daily' | 'weekdays' | 'timesPerWeek';
  /** 0 = Sunday … 6 = Saturday; for kind = 'weekdays'. */
  weekdays?: number[];
  /** For kind = 'timesPerWeek'. */
  timesPerWeek?: number;
}

export interface Habit extends BaseRecord {
  name: string;
  schedule: HabitSchedule;
  archived: boolean;
  color?: string;
  /** Kept on days with `DailyTargets.habitsMode = 'essential'` (event day). Default false. */
  essential?: boolean;
}

export interface HabitLog extends BaseRecord {
  habitId: Id;
  date: DateKey;
  done: boolean;
}

// ---------- time ----------

export interface TimeCategory extends BaseRecord {
  name: string;
  color?: string;
  archived: boolean;
}

export interface TimeEntry extends BaseRecord {
  categoryId: Id;
  taskId?: Id;
  start: Millis;
  /** Undefined while the timer is running. */
  end?: Millis;
  /** Local day of `start`, denormalized for fast queries. */
  date: DateKey;
  source: 'timer' | 'pomodoro' | 'manual';
  note?: string;
}

// ---------- health ----------

export interface SleepLog extends BaseRecord {
  /** The morning you woke up — the day this sleep counts for. */
  date: DateKey;
  bedtime: Millis;
  wakeTime: Millis;
  /** 1–5 */
  quality: number;
  /**
   * App the night was imported from (Sleep Cycle, Health Connect / HealthKit source); absent for a night entered in
   * LifeOS. «Прогресс» counts such nights as transferred history, not lived experience (#227).
   */
  sourceId?: string;
  /** Id in that app or store; with `sourceId` it keys the update on re-import (`[sourceId+externalId]`). */
  externalId?: string;
}

/**
 * One minute of night sensing (`startNightSensing()` in `platform.ts`): aggregates only — no raw motion, no audio
 * is stored. The health module reads the buffer in the morning and derives sleep phases from it.
 * `null` means «no readings» (no sensor, microphone busy or failed) — never treat it as «still» or «silence».
 * Minutes without any readings are not written, so the buffer may have gaps; the first and last minutes are partial.
 */
export interface NightSample {
  /** Start of the minute, epoch ms (whole minutes; map to a `DateKey` in the module — a night crosses midnight). */
  minuteStart: Millis;
  /** Mean change of the acceleration vector between readings, m/s² (0 — lying still; turning over counts). */
  movement: number | null;
  /** Largest single change of the acceleration vector in the minute, m/s² (short movements). */
  movementPeak: number | null;
  /** Mean noise level over the minute, dBFS (−90 … 0). */
  noiseDb: number | null;
  /** Loudest 100 ms of the minute, dBFS (−90 … 0). */
  noisePeakDb: number | null;
}

/**
 * Where a record imported from Health Connect / HealthKit came from (`readSleep` / `readWorkouts` in `platform.ts`).
 * The same record read twice has the same `externalId`; the same night logged by two apps has two `sourceId`s.
 */
export interface HealthImportSource {
  /** Id of the record in the health store (HealthKit UUID / Health Connect metadata id). */
  externalId: string;
  /** App that recorded it (bundle / package id), e.g. `com.sec.android.app.shealth`; `unknown` if not reported. */
  sourceId: string;
  /** Human-readable app or device name, when the store reports one. */
  sourceName?: string;
}

/** One night from the health store, ready for `saveSleep` (the module adds `quality`). */
export interface ImportedSleep extends HealthImportSource {
  bedtime: Millis;
  wakeTime: Millis;
  /** Minutes actually asleep (stages «asleep», «light», «deep», «REM»); absent when the store reports no stages. */
  asleepMin?: number;
  /**
   * The longest sleep of this app ending on that day. Naps are separate entries with `main: false`; `saveSleep`
   * keeps one record per day, so save the main one.
   */
  main: boolean;
}

/** One workout from the health store, ready for `saveWorkout` (the module adds `rpe`). */
export interface ImportedWorkout extends HealthImportSource {
  /** Local day of the start. */
  date: DateKey;
  startedAt: Millis;
  /** The app's workout type name: Силовая, Бег, Велосипед, Плавание, Йога, Ходьба or Другое. */
  type: string;
  durationMin: number;
  /** Energy, kcal. Absent on Android (reading it needs extra Health Connect permissions, not requested). */
  kcal?: number;
  /** Distance, metres. Absent on Android, as `kcal`. */
  distanceM?: number;
}

export interface Food extends BaseRecord {
  name: string;
  /** Per 100 g. */
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  source: 'custom' | 'openfoodfacts';
  externalId?: string;
}

export interface MealItem {
  foodId: Id;
  grams: number;
}

export interface MealLog extends BaseRecord {
  date: DateKey;
  time: Millis;
  kind: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: MealItem[];
}

export type WorkoutIntensity = 'rest' | 'light' | 'moderate' | 'hard';

export interface WorkoutLog extends BaseRecord {
  date: DateKey;
  type: string;
  durationMin: number;
  /** Rate of perceived exertion, 1–10. */
  rpe: number;
  exercises?: { name: string; sets: { reps?: number; weightKg?: number }[]; muscleGroups?: MuscleGroup[] }[];
  note?: string;
  /** App that recorded an imported workout (`ImportedWorkout.sourceId`); absent for workouts entered in the app. */
  sourceId?: string;
  /** Id in the health store; with `sourceId` it keys the update on re-import (`[sourceId+externalId]`). */
  externalId?: string;
}

// ---------- cognition ----------

export type CognitiveTestKind = 'pvt';

/**
 * One run of a cognitive test. PVT = psychomotor vigilance task: tap as fast as possible when
 * a stimulus appears at random intervals. Objective measure of alertness used for personalization.
 */
export interface CognitiveTest extends BaseRecord {
  date: DateKey;
  kind: CognitiveTestKind;
  startedAt: Millis;
  durationMs: number;
  /** Reaction times of valid responses, ms. */
  reactionTimesMs: number[];
  /** Valid responses slower than 500 ms. */
  lapses: number;
  /** Taps before the stimulus appeared (or faster than 100 ms). */
  falseStarts: number;
  /** Median of reactionTimesMs, ms — denormalized for charts and adaptation. */
  medianRtMs: number;
}

// ---------- check-in ----------

export interface CheckIn extends BaseRecord {
  date: DateKey;
  /** 1–5 */
  energy: number;
  /** 1–5 */
  focus: number;
  note?: string;
}

// ---------- adaptation ----------

export type LifeEventType = 'exam' | 'deadline' | 'interview' | 'competition' | 'travel' | 'other';

export interface LifeEvent extends BaseRecord {
  title: string;
  type: LifeEventType;
  date: DateKey;
  /** 'HH:mm', optional. */
  time?: string;
  /** 1 = normal, 2 = important, 3 = critical. */
  importance: 1 | 2 | 3;
  /** Task project this event is about (e.g. the exam subject). */
  projectId?: Id;
  /** Days of preparation before the event. Default 7. */
  prepDays: number;
}

// ---------- nutrition (SPEC 0.3, 5.6) ----------

/** One body-weight measurement per day (`date` is unique). Owner: nutrition. */
export interface WeightLog extends BaseRecord {
  date: DateKey;
  /** Body weight, kilograms. */
  kg: number;
}

// ---------- training (SPEC 0.3, 5.6) ----------

/** What an exercise loads (#225). Values: `MUSCLE_GROUPS` in `exercises.ts`. */
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core' | 'cardio' | 'mobility';

/** One exercise of a program day or of a planned session. */
export interface ProgramExercise {
  name: string;
  /** Optional: records saved before #225 have none; `muscleGroupsOf(name)` knows the starter exercises. */
  muscleGroups?: MuscleGroup[];
  /** Number of sets. */
  sets: number;
  /** Repetitions per set; omitted for time- or distance-based work. */
  reps?: number;
  weightKg?: number;
  /** Target rate of perceived exertion, 1–10. */
  rpeTarget?: number;
}

/** A day of a program: which weekday and what to do. */
export interface ProgramDay {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  exercises: ProgramExercise[];
}

/** A training program / template the user follows. Owner: training. */
export interface Program extends BaseRecord {
  name: string;
  archived: boolean;
  days: ProgramDay[];
  /** Plan length in weeks. Default 4. */
  weeks: number;
}

export type PlannedSessionStatus = 'planned' | 'done' | 'skipped';

/**
 * A program day scheduled on a calendar day (`[programId+date]` is unique). `exercises` is a copy
 * for that day, so later edits of the program do not rewrite history. Owner: training.
 */
export interface PlannedSession extends BaseRecord {
  programId: Id;
  date: DateKey;
  exercises: ProgramExercise[];
  status: PlannedSessionStatus;
  /** The `workoutLogs` record written (through `saveWorkout`) when the session was done. */
  workoutLogId?: Id;
}

// ---------- meditation (SPEC 0.3, 5.6) ----------

export type MeditationKind = 'breathing' | 'focus' | 'sleep' | 'body';

/** One meditation / breathing session. Owner: meditation. */
export interface MeditationSession extends BaseRecord {
  date: DateKey;
  startedAt: Millis;
  durationMin: number;
  kind: MeditationKind;
  /** Breathing pattern for kind = 'breathing', e.g. '4-7-8' or 'box'. */
  pattern?: string;
  /** False when the session was stopped early. */
  completed: boolean;
}

// ---------- cognition: mind trainers (SPEC 0.3, 5.6) ----------

export type MindSessionKind = 'nback' | 'stroop' | 'schulte';

/** One run of a mind trainer (n-back, Stroop, Schulte table). Owner: cognition. */
export interface MindSession extends BaseRecord {
  date: DateKey;
  kind: MindSessionKind;
  durationMs: number;
  /** Share of correct answers, 0–100. */
  accuracyPct: number;
  /** Difficulty level; for n-back — the n. */
  level?: number;
  /** Mean reaction time of correct answers, ms. */
  meanRtMs?: number;
  errors?: number;
}

// ---------- notes (SPEC 0.3, 5.6) ----------

/** A markdown page linked to projects, events or days. Owner: notes. */
export interface Note extends BaseRecord {
  title: string;
  /** Markdown. */
  body: string;
  /** Multi-entry index: ids of projects or life events, or `DateKey`s of days this note is about. */
  linkIds: string[];
  pinned?: boolean;
}

// ---------- progress (SPEC 0.3, 5.6) ----------

export type XpSource = 'quest';

/** Experience points earned on a day. Owner: progress. */
export interface XpEvent extends BaseRecord {
  date: DateKey;
  source: XpSource;
  /** The daily quest that granted the points. */
  questId: Id;
  amount: number;
}

// ---------- settings ----------

export interface Setting {
  key: string;
  value: unknown;
}
