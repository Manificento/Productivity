import { toDateKey } from '../../../core/dates';
import type { DateKey, Id, Millis } from '../../../core/types';
import type { ParseResult } from './timer';

const MIN = 60_000;

export interface PomodoroSettings {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  /** A long break follows every N-th focus session. */
  sessionsBeforeLongBreak: number;
}

export const DEFAULT_POMODORO: PomodoroSettings = {
  workMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  sessionsBeforeLongBreak: 4,
};

export type Phase = 'work' | 'shortBreak' | 'longBreak';

/** What a focus session is attached to. */
export interface FocusTarget {
  categoryId: Id;
  taskId?: Id;
}

export type PomodoroState =
  | { status: 'idle'; completedWork: number; /** When the last phase ended. */ idleSince?: Millis }
  | {
      status: 'running';
      phase: Phase;
      startedAt: Millis;
      endsAt: Millis;
      completedWork: number;
      target: FocusTarget;
    };

export const IDLE: PomodoroState = { status: 'idle', completedWork: 0 };

/** A focus interval to record as a `TimeEntry` with source 'pomodoro'. */
export interface FocusRecord extends FocusTarget {
  start: Millis;
  end: Millis;
  date: DateKey;
}

export interface Advance {
  state: PomodoroState;
  /** Focus sessions that ended, to be written to time tracking. */
  records: FocusRecord[];
  /** Phases that ran out on their own, with the moment each ended (each one deserves a signal). */
  finished: { phase: Phase; endedAt: Millis }[];
}

function record(target: FocusTarget, start: Millis, end: Millis): FocusRecord {
  const r: FocusRecord = { categoryId: target.categoryId, start, end, date: toDateKey(start) };
  if (target.taskId !== undefined) r.taskId = target.taskId;
  return r;
}

/** Break that follows the `completedWork`-th focus session. */
export function breakAfter(completedWork: number, settings: PomodoroSettings): Phase {
  return completedWork > 0 && completedWork % settings.sessionsBeforeLongBreak === 0 ? 'longBreak' : 'shortBreak';
}

export function phaseMinutes(phase: Phase, settings: PomodoroSettings): number {
  if (phase === 'work') return settings.workMin;
  return phase === 'longBreak' ? settings.longBreakMin : settings.shortBreakMin;
}

/** After this long without focus the cycle starts over (next morning, long pause). */
export const CYCLE_RESET_MS = 60 * MIN;

/** Focus sessions done in the current cycle; resets after a long idle pause. */
export function completedInCycle(state: PomodoroState, now: Millis): number {
  if (state.status === 'idle' && state.idleSince !== undefined && now - state.idleSince >= CYCLE_RESET_MS) return 0;
  return state.completedWork;
}

/** Starts a focus session. Durations are taken from `settings` at this moment. */
export function startFocus(
  state: PomodoroState,
  settings: PomodoroSettings,
  target: FocusTarget,
  now: Millis,
): PomodoroState {
  return {
    status: 'running',
    phase: 'work',
    startedAt: now,
    endsAt: now + settings.workMin * MIN,
    completedWork: completedInCycle(state, now),
    target,
  };
}

/**
 * Moves the timer forward to `now` using only timestamps, so time spent in a background tab counts.
 * Focus → break starts automatically; after a break the timer waits for the next focus session.
 */
export function advance(state: PomodoroState, settings: PomodoroSettings, now: Millis): Advance {
  const records: FocusRecord[] = [];
  const finished: Advance['finished'] = [];
  let s = state;
  while (s.status === 'running' && now >= s.endsAt) {
    finished.push({ phase: s.phase, endedAt: s.endsAt });
    if (s.phase === 'work') {
      records.push(record(s.target, s.startedAt, s.endsAt));
      const completedWork = s.completedWork + 1;
      const phase = breakAfter(completedWork, settings);
      s = {
        ...s,
        phase,
        startedAt: s.endsAt,
        endsAt: s.endsAt + phaseMinutes(phase, settings) * MIN,
        completedWork,
      };
    } else {
      s = { status: 'idle', completedWork: s.completedWork, idleSince: s.endsAt };
    }
  }
  return { state: s, records, finished };
}

/**
 * Stops the timer early. Focus time already spent (at least a minute) is still recorded.
 */
export function stop(state: PomodoroState, now: Millis): { state: PomodoroState; records: FocusRecord[] } {
  if (state.status !== 'running') return { state, records: [] };
  const end = Math.min(now, state.endsAt);
  const idle: PomodoroState = { status: 'idle', completedWork: state.completedWork, idleSince: end };
  const spent = state.phase === 'work' && end - state.startedAt >= MIN;
  return { state: idle, records: spent ? [record(state.target, state.startedAt, end)] : [] };
}

export function remainingMs(state: PomodoroState, now: Millis): Millis {
  return state.status === 'running' ? Math.max(0, state.endsAt - now) : 0;
}

/** Position of the next/current focus session inside the cycle: 1…sessionsBeforeLongBreak. */
export function sessionInCycle(state: PomodoroState, settings: PomodoroSettings, now: Millis): number {
  const n = settings.sessionsBeforeLongBreak;
  const completed = completedInCycle(state, now);
  const done = state.status === 'running' && state.phase !== 'work' ? completed - 1 : completed;
  return (((done % n) + n) % n) + 1;
}

export type SettingsInput = Record<keyof PomodoroSettings, string>;

const LIMITS: Record<keyof PomodoroSettings, { min: number; max: number; label: string }> = {
  workMin: { min: 1, max: 180, label: 'Фокус' },
  shortBreakMin: { min: 1, max: 60, label: 'Короткий перерыв' },
  longBreakMin: { min: 1, max: 120, label: 'Длинный перерыв' },
  sessionsBeforeLongBreak: { min: 1, max: 12, label: 'Сессий до длинного перерыва' },
};

/** Validates the settings form: whole numbers within sensible limits. */
export function parsePomodoroSettings(input: SettingsInput): ParseResult<PomodoroSettings, keyof PomodoroSettings> {
  const out = { ...DEFAULT_POMODORO };
  for (const key of Object.keys(LIMITS) as (keyof PomodoroSettings)[]) {
    const { min, max, label } = LIMITS[key];
    const raw = input[key].trim();
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < min || value > max) {
      return { ok: false, field: key, error: `${label}: целое число от ${min} до ${max}` };
    }
    out[key] = value;
  }
  return { ok: true, value: out };
}

/** Restores a persisted state; anything malformed falls back to idle. */
export function restoreState(raw: unknown): PomodoroState {
  if (!raw || typeof raw !== 'object') return IDLE;
  const s = raw as Record<string, unknown>;
  const completedWork =
    typeof s.completedWork === 'number' && Number.isInteger(s.completedWork) && s.completedWork >= 0
      ? s.completedWork
      : 0;
  if (s.status === 'idle') {
    return typeof s.idleSince === 'number'
      ? { status: 'idle', completedWork, idleSince: s.idleSince }
      : { status: 'idle', completedWork };
  }
  const phases: unknown[] = ['work', 'shortBreak', 'longBreak'];
  const target = (s.target ?? {}) as Record<string, unknown>;
  if (
    s.status === 'running' &&
    phases.includes(s.phase) &&
    typeof s.startedAt === 'number' &&
    typeof s.endsAt === 'number' &&
    s.endsAt >= s.startedAt &&
    typeof target.categoryId === 'string'
  ) {
    const restored: FocusTarget = { categoryId: target.categoryId };
    if (typeof target.taskId === 'string') restored.taskId = target.taskId;
    return {
      status: 'running',
      phase: s.phase as Phase,
      startedAt: s.startedAt,
      endsAt: s.endsAt,
      completedWork,
      target: restored,
    };
  }
  return IDLE;
}

/** Restores persisted settings; invalid or missing fields take defaults. */
export function restoreSettings(raw: unknown): PomodoroSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_POMODORO;
  const r = raw as Record<string, unknown>;
  const out = { ...DEFAULT_POMODORO };
  for (const key of Object.keys(LIMITS) as (keyof PomodoroSettings)[]) {
    const v = r[key];
    const { min, max } = LIMITS[key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) out[key] = v;
  }
  return out;
}
