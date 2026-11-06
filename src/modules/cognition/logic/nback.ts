/**
 * Visual n-back on a 3×3 grid as pure functions: a square lights up each trial; the user presses
 * «Совпало» when it is the same cell as n trials ago. No React, no Dexie.
 */
import { shiftDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';

export const GRID_CELLS = 9;
/** 3 minutes. */
export const NBACK_DURATION_MS = 180_000;
/** One trial: the cell is shown, then a pause; the answer window is the whole trial. */
export const TRIAL_MS = 2_500;
/** How long the cell stays lit within a trial. */
export const STIMULUS_MS = 800;
export const START_LEVEL = 2;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 9;
export const RAISE_AT_PCT = 85;
export const LOWER_AT_PCT = 60;
/** Share of trials that are matches. */
const TARGET_RATE = 0.3;

export function trialCountFor(durationMs: number): number {
  return Math.max(1, Math.floor(durationMs / TRIAL_MS));
}

export function isTarget(sequence: number[], index: number, n: number): boolean {
  return index >= n && sequence[index] === sequence[index - n];
}

/** Random cells with ~30% matches (never in the first n trials). `random` returns [0, 1) like Math.random. */
export function generateSequence(length: number, n: number, random: () => number = Math.random): number[] {
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i >= n && random() < TARGET_RATE) {
      seq.push(seq[i - n]);
      continue;
    }
    let cell = Math.floor(random() * GRID_CELLS);
    // A «random» cell must not accidentally become a match, otherwise the target share drifts up.
    if (i >= n && cell === seq[i - n]) cell = (cell + 1 + Math.floor(random() * (GRID_CELLS - 1))) % GRID_CELLS;
    seq.push(cell);
  }
  return seq;
}

export interface NbackAnswer {
  pressed: boolean;
  /** Reaction time from the moment the cell appeared, ms. */
  rtMs?: number;
}

export interface NbackScore {
  /** 0–100, mean of hit rate and correct-rejection rate. */
  accuracyPct: number;
  /** Mean RT of hits; undefined without hits. */
  meanRtMs?: number;
  /** Misses plus false alarms. */
  errors: number;
  /** Scored trials (the first n have nothing to compare to). */
  trials: number;
}

/**
 * Accuracy is the mean of the hit rate and the correct-rejection rate, so pressing nothing scores ~50%
 * (not ~70%, the share of non-matches) and the «≤ 60% → easier» rule fires for a user who gave up.
 */
export function scoreNback(sequence: number[], n: number, answers: NbackAnswer[]): NbackScore {
  let hits = 0;
  let targets = 0;
  let rejections = 0;
  let nonTargets = 0;
  let trials = 0;
  const hitRts: number[] = [];
  for (let i = n; i < sequence.length; i++) {
    trials++;
    const answer = answers[i];
    const pressed = answer?.pressed === true;
    if (isTarget(sequence, i, n)) {
      targets++;
      if (pressed) {
        hits++;
        if (answer.rtMs !== undefined) hitRts.push(answer.rtMs);
      }
    } else {
      nonTargets++;
      if (!pressed) rejections++;
    }
  }
  const rates = [targets ? hits / targets : undefined, nonTargets ? rejections / nonTargets : undefined].filter(
    (r): r is number => r !== undefined,
  );
  const accuracyPct = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) : 0;
  const meanRtMs = hitRts.length ? Math.round(hitRts.reduce((a, b) => a + b, 0) / hitRts.length) : undefined;
  return { accuracyPct, meanRtMs, errors: targets - hits + (nonTargets - rejections), trials };
}

/** The fields of a saved session that level adaptation and history need. */
export interface NbackPoint {
  date: DateKey;
  level?: number;
  accuracyPct: number;
  createdAt: number;
}

/**
 * Level of the next session: 2 without history; +1 after two sessions in a row at the same level
 * with accuracy ≥ 85%; −1 (not below 1) after a session with accuracy ≤ 60%; otherwise the same.
 */
export function nextLevel(history: NbackPoint[]): number {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const last = sorted[sorted.length - 1];
  if (!last) return START_LEVEL;
  const level = last.level ?? START_LEVEL;
  if (last.accuracyPct <= LOWER_AT_PCT) return Math.max(MIN_LEVEL, level - 1);
  const previous = sorted[sorted.length - 2];
  if (
    last.accuracyPct >= RAISE_AT_PCT &&
    previous &&
    previous.accuracyPct >= RAISE_AT_PCT &&
    (previous.level ?? START_LEVEL) === level
  )
    return Math.min(MAX_LEVEL, level + 1);
  return level;
}

export interface DayProgress {
  date: DateKey;
  /** Undefined on days without a session. */
  level?: number;
  accuracyPct?: number;
}

/** One point per day for the last `days` days ending `today`: highest level, mean accuracy. */
export function dailyProgress(sessions: NbackPoint[], today: DateKey, days: number): DayProgress[] {
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDateKey(today, i - (days - 1));
    const own = sessions.filter((s) => s.date === date);
    if (!own.length) return { date };
    const level = Math.max(...own.map((s) => s.level ?? START_LEVEL));
    const accuracyPct = Math.round(own.reduce((sum, s) => sum + s.accuracyPct, 0) / own.length);
    return { date, level, accuracyPct };
  });
}

/** E2E runs and the dev server may shorten the session with `?duration=<s>` (1–180). */
export function parseNbackDurationParam(param: string | null, testMode: boolean): number {
  if (!testMode || param === null) return NBACK_DURATION_MS;
  const seconds = Number(param);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > NBACK_DURATION_MS / 1_000) return NBACK_DURATION_MS;
  return seconds * 1_000;
}
