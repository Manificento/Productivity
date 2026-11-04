import type { CheckIn, DateKey, Id, LifeEvent, MeditationKind, WorkoutIntensity } from '../types';

export type Phase = 'normal' | 'prep' | 'taper' | 'event' | 'recovery';

/** The user's normal day. Stored in settings under BASELINE_SETTING_KEY. */
export interface Baseline {
  taskCapacityMin: number;
  sleepHours: number;
  /** 'HH:mm' */
  bedtime: string;
  maxWorkoutIntensity: WorkoutIntensity;
  focusPomodoros: number;
  meditationMin: number;
  /** 'HH:mm' */
  caffeineCutoff: string;
  /** 'HH:mm' — planned wake-up (v2). */
  wakeTime: string;
  /** Minutes of mind trainers (n-back, Stroop, Schulte) on a normal day (v2). */
  mindTrainingMin: number;
}

/** `all` habits, or only those marked `Habit.essential`. */
export type HabitsMode = 'all' | 'essential';

/** `settings` `nutrition.goal`: direction and rate, % of body weight per week. */
export interface NutritionGoal {
  kind: 'lose' | 'maintain' | 'gain';
  ratePct: number;
}

/**
 * Targets for one day — THE cross-module contract.
 * Every module reads these (via useDailyTargets) and never invents its own adaptation logic.
 */
export interface DailyTargets {
  date: DateKey;
  phase: Phase;
  activeEventId?: Id;
  /** Project the day's focus should go to (from the active event). */
  focusProjectId?: Id;
  /** Minutes of task work planned for the day. */
  taskCapacityMin: number;
  /** Whether priority 3–4 tasks may be suggested for deferral. */
  allowDeferLowPriority: boolean;
  sleepHours: number;
  /** 'HH:mm' */
  bedtime: string;
  maxWorkoutIntensity: WorkoutIntensity;
  focusPomodoros: number;
  meditationMin: number;
  /** 'HH:mm' */
  caffeineCutoff: string;
  noNewFoods: boolean;
  // ---- v2 (contract M5, SPEC 0.3 §5.3) ----
  habitsMode: HabitsMode;
  /** 'HH:mm' */
  wakeTime: string;
  /** Smart alarm window before `wakeTime`, minutes. */
  wakeWindowMin: number;
  /** A deload day for the training plan. */
  deload: boolean;
  /** Nutrition targets; `undefined` until expenditure, goal and weight are known. */
  kcal?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
  meditationKind: MeditationKind;
  mindTrainingMin: number;
  /** Human-readable reasons in Russian, one per adjustment, shown in the UI. */
  reasons: string[];
}

export interface AdaptationContext {
  baseline: Baseline;
  events: LifeEvent[];
  /** Hours slept the night before `date` (the SleepLog with date = `date`). */
  lastSleepHours?: number;
  checkIn?: CheckIn;
  /**
   * Hours slept on the nights that ended on `date`, `date − 1`, `date − 2` (most recent first);
   * `undefined` where a night was not logged.
   */
  recentSleepHours?: (number | undefined)[];
  /** Highest RPE among the workouts logged the day before `date`. */
  yesterdayMaxRpe?: number;
  // ---- v2 ----
  /** `settings` `nutrition.expenditure.kcal` — computed by the nutrition module, not by the core. */
  expenditureKcal?: number;
  /** `settings` `nutrition.goal`. */
  nutritionGoal?: NutritionGoal;
  /** Latest body weight on or before `date`, kg. */
  weightKg?: number;
  /** Medians of PVT runs of the last 14 days, most recent first (for the PVT rule, today lane). */
  recentPvtMediansMs?: number[];
  /** Minutes of meditation logged the day before `date`. */
  meditationMinYesterday?: number;
}

/** A declarative adjustment applied when its phase is active. */
export interface PhaseRule {
  phase: Exclude<Phase, 'normal'>;
  apply: (t: DailyTargets, event: LifeEvent) => DailyTargets;
}

/** A declarative adjustment driven by logged data (sleep, check-in, …). */
export interface ConditionRule {
  id: string;
  /** `date` is the day the targets are computed for. */
  when: (ctx: AdaptationContext, date: DateKey) => boolean;
  apply: (t: DailyTargets, ctx: AdaptationContext) => DailyTargets;
}
