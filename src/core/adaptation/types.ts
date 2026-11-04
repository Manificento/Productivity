import type { CheckIn, DateKey, Id, LifeEvent, WorkoutIntensity } from '../types';

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
  /** Human-readable reasons in Russian, one per adjustment, shown in the UI. */
  reasons: string[];
}

export interface AdaptationContext {
  baseline: Baseline;
  events: LifeEvent[];
  /** Hours slept the night before `date` (the SleepLog with date = `date`). */
  lastSleepHours?: number;
  checkIn?: CheckIn;
}

/** A declarative adjustment applied when its phase is active. */
export interface PhaseRule {
  phase: Exclude<Phase, 'normal'>;
  apply: (t: DailyTargets, event: LifeEvent) => DailyTargets;
}

/** A declarative adjustment driven by logged data (sleep, check-in, …). */
export interface ConditionRule {
  id: string;
  when: (ctx: AdaptationContext) => boolean;
  apply: (t: DailyTargets, ctx: AdaptationContext) => DailyTargets;
}
