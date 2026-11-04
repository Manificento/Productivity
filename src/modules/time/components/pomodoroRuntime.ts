import {
  loadPomodoroSettings,
  loadPomodoroState,
  POMODORO_STATE_KEY,
  savePomodoroSettings,
  savePomodoroState,
  syncRunningSetting,
} from '../data/pomodoroStore';
import { addFocusRecords, stopRunningTimers } from '../data/timeStore';
import {
  advance,
  startFocus,
  stop,
  type FocusTarget,
  type PomodoroSettings,
  type PomodoroState,
} from '../logic/pomodoro';
import { signalPhaseEnd, unlockSound } from './signal';

/** Phases that ended longer ago than this (e.g. the app was closed) end silently. */
export const SIGNAL_WINDOW_MS = 2 * 60_000;
const SAVE_ERROR = 'Не удалось записать фокус-сессию в учёт времени. Попробуем ещё раз автоматически';

export interface PomodoroSnapshot {
  state: PomodoroState;
  settings: PomodoroSettings;
  now: number;
  error?: string;
}

/*
 * One Pomodoro timer per page, shared by everything that uses it: the shell's background component
 * (`PomodoroBackground`, mounted on every page) and the «Время» screens. Every tick (each second and
 * whenever the tab becomes visible) recomputes the state from timestamps, so a throttled tab never drifts.
 *
 * Finished focus sessions are written to `timeEntries` BEFORE the new state is committed: if the write
 * fails, the state stays put and the next tick retries (writes are idempotent by start time).
 *
 * The timer runs while at least one user is attached. When the last one detaches, the next attach
 * reloads the state from storage (another tab may have changed it meanwhile).
 */
let snap: PomodoroSnapshot | undefined;
let users = 0;
let busy = false;
/** Bumped on every (re)start, so writes that finish after a restart are ignored. */
let generation = 0;
let teardown: (() => void) | undefined;
const listeners = new Set<() => void>();

function load(): PomodoroSnapshot {
  return { state: loadPomodoroState(), settings: loadPomodoroSettings(), now: Date.now() };
}

export function getPomodoro(): PomodoroSnapshot {
  snap ??= load();
  return snap;
}

function emit(patch: Partial<PomodoroSnapshot>): void {
  snap = { ...getPomodoro(), ...patch };
  for (const l of listeners) l();
}

function commit(next: PomodoroState): void {
  savePomodoroState(next);
  void syncRunningSetting(next);
  emit({ state: next });
}

function tick(): void {
  const t = Date.now();
  const { state: base, settings } = getPomodoro();
  // Idle and nobody shows the clock (only the background is attached): nothing to do this second.
  if (base.status === 'idle' && listeners.size === 0) return;
  if (busy) {
    emit({ now: t });
    return;
  }
  const r = advance(base, settings, t);
  if (r.state === base) {
    emit({ now: t });
    return;
  }
  const last = r.finished.at(-1);
  const gen = generation;
  const finish = () => {
    if (gen !== generation || getPomodoro().state !== base) return; // changed meanwhile (stop, another tab)
    emit({ now: t });
    commit(r.state);
    if (last && t - last.endedAt < SIGNAL_WINDOW_MS) signalPhaseEnd(last.phase);
  };
  if (r.records.length === 0) {
    finish();
    return;
  }
  busy = true;
  addFocusRecords(r.records, t)
    .then(
      () => {
        if (gen !== generation) return;
        emit({ error: undefined });
        finish();
      },
      () => {
        if (gen === generation) emit({ error: SAVE_ERROR });
      },
    )
    .finally(() => {
      if (gen === generation) busy = false;
    });
}

function run(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') tick();
  };
  // Another open tab changed the timer: follow it instead of keeping a stale copy.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== POMODORO_STATE_KEY) return;
    const state = loadPomodoroState();
    void syncRunningSetting(state);
    emit({ state });
  };
  const first = setTimeout(tick, 0);
  const id = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('storage', onStorage);
  return () => {
    clearTimeout(first);
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('storage', onStorage);
  };
}

/** Keeps the timer running until the returned function is called. */
export function attachPomodoro(): () => void {
  if (users++ === 0) {
    generation++;
    busy = false;
    snap = load();
    // Heal a stale key (restored backup, failed delete, cleared local state): settings follow the real timer.
    void syncRunningSetting(snap.state);
    teardown = run();
  }
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    if (--users === 0) {
      teardown?.();
      teardown = undefined;
      generation++;
      snap = undefined;
    }
  };
}

/** For `useSyncExternalStore`: subscribing also keeps the timer running. */
export function subscribePomodoro(listener: () => void): () => void {
  listeners.add(listener);
  const detach = attachPomodoro();
  return () => {
    listeners.delete(listener);
    detach();
  };
}

export async function startPomodoro(target: FocusTarget): Promise<void> {
  unlockSound(); // inside the click: browsers allow audio only after a user gesture
  const t = Date.now();
  try {
    await stopRunningTimers(t);
  } catch {
    emit({ error: 'Не удалось остановить таймер учёта. Попробуйте ещё раз' });
    return;
  }
  const { state, settings } = getPomodoro();
  emit({ error: undefined, now: t });
  commit(startFocus(state, settings, target, t));
}

/**
 * Stops the current phase; spent focus time is recorded first, so a failed write keeps the timer.
 * Resolves to `false` when the timer could not be stopped.
 */
export async function stopPomodoro(): Promise<boolean> {
  const t = Date.now();
  const base = getPomodoro().state;
  const r = stop(base, t);
  try {
    await addFocusRecords(r.records, t);
  } catch {
    emit({ error: 'Не удалось записать фокус-сессию. Попробуйте ещё раз' });
    return false;
  }
  emit({ error: undefined, now: t });
  if (getPomodoro().state === base) commit(r.state);
  return true;
}

export function savePomodoroSettingsNow(next: PomodoroSettings): void {
  savePomodoroSettings(next);
  emit({ settings: next });
}
