/**
 * PVT (psychomotor vigilance task) as a pure state machine.
 * Every transition takes the current time (`performance.now()` in the UI) and, where a new
 * stimulus is scheduled, the delay until it — so tests are fully deterministic.
 */

/** Normal test length. */
export const PVT_DURATION_MS = 60_000;
/** Random pause before each stimulus: 2–10 s. */
export const MIN_DELAY_MS = 2_000;
export const MAX_DELAY_MS = 10_000;
/** Reactions faster than this are anticipation, not reaction → false start. */
export const FALSE_START_MS = 100;
/** Reactions slower than this are lapses. */
export const LAPSE_MS = 500;

export type PvtFeedback = { kind: 'reaction'; ms: number } | { kind: 'falseStart' };

export interface PvtRunning {
  phase: 'running';
  startedAt: number;
  endsAt: number;
  /** When the next stimulus should appear. */
  stimulusAt: number;
  /** When the current stimulus actually appeared; undefined while waiting. */
  shownAt?: number;
  reactionTimesMs: number[];
  falseStarts: number;
  /** Result of the last tap, shown briefly to the user. */
  feedback?: PvtFeedback;
}

export interface PvtSummary {
  reactionTimesMs: number[];
  medianRtMs: number;
  lapses: number;
  falseStarts: number;
}

export interface PvtDone {
  phase: 'done';
  durationMs: number;
  result: PvtSummary;
}

export type PvtState = PvtRunning | PvtDone;

/** Random delay before the next stimulus, 2–10 s. `random` returns [0, 1) like Math.random. */
export function randomDelayMs(random: () => number = Math.random): number {
  return MIN_DELAY_MS + random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

export function startPvt(now: number, durationMs: number, firstDelayMs: number): PvtRunning {
  return {
    phase: 'running',
    startedAt: now,
    endsAt: now + durationMs,
    stimulusAt: now + firstDelayMs,
    reactionTimesMs: [],
    falseStarts: 0,
  };
}

/** Called every animation frame: shows the stimulus when due, finishes the test when time is up. */
export function tickPvt(state: PvtRunning, now: number): PvtState {
  if (now >= state.endsAt) return finishPvt(state, now);
  if (state.shownAt === undefined && now >= state.stimulusAt) return { ...state, shownAt: now };
  return state;
}

/** A tap on the screen. Before the stimulus or faster than 100 ms it is a false start. */
export function tapPvt(state: PvtRunning, now: number, nextDelayMs: number): PvtRunning {
  if (now >= state.endsAt) return state;
  const next = { ...state, stimulusAt: now + nextDelayMs, shownAt: undefined };
  const rt = state.shownAt === undefined ? undefined : now - state.shownAt;
  if (rt === undefined || rt < FALSE_START_MS) {
    return { ...next, falseStarts: state.falseStarts + 1, feedback: { kind: 'falseStart' } };
  }
  return { ...next, reactionTimesMs: [...state.reactionTimesMs, rt], feedback: { kind: 'reaction', ms: rt } };
}

/**
 * Ends the test. A stimulus still waiting for a tap for longer than the lapse threshold is a
 * missed stimulus: it counts as a lapse, but adds no reaction time (there was no response to measure).
 * A fresher one is dropped — there was no fair chance to react.
 */
export function finishPvt(state: PvtRunning, now: number): PvtDone {
  const end = Math.min(now, state.endsAt);
  const missed = state.shownAt !== undefined && end - state.shownAt > LAPSE_MS ? 1 : 0;
  return {
    phase: 'done',
    durationMs: state.endsAt - state.startedAt,
    result: summarizePvt(state.reactionTimesMs, state.falseStarts, missed),
  };
}

/** `missed` = stimuli never answered; each one is a lapse on top of the slow reactions. */
export function summarizePvt(reactionTimesMs: number[], falseStarts: number, missed = 0): PvtSummary {
  const rounded = reactionTimesMs.map((ms) => Math.round(ms));
  return {
    reactionTimesMs: rounded,
    medianRtMs: median(rounded),
    lapses: rounded.filter((ms) => ms > LAPSE_MS).length + missed,
    falseStarts,
  };
}

/** Median, rounded to whole milliseconds; 0 for an empty list. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value);
}

/**
 * Test length from `?duration=<seconds>`. Only honoured in test mode (E2E), so a shared link
 * cannot turn the real 60-second test into a shorter, incomparable one.
 */
export function parseDurationParam(param: string | null, testMode: boolean): number {
  if (!testMode || param === null) return PVT_DURATION_MS;
  const seconds = Number(param);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) return PVT_DURATION_MS;
  return seconds * 1_000;
}

/** `?return=` target: only in-app paths, never another site. */
export function safeReturnPath(param: string | null): string | undefined {
  if (!param || !param.startsWith('/') || param.startsWith('//') || param.includes('\\')) return undefined;
  return param;
}
