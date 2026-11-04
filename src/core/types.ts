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
}

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
  exercises?: { name: string; sets: { reps?: number; weightKg?: number }[] }[];
  note?: string;
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

// ---------- settings ----------

export interface Setting {
  key: string;
  value: unknown;
}
