import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPomodoroSettings,
  loadPomodoroState,
  POMODORO_STATE_KEY,
  savePomodoroSettings,
  savePomodoroState,
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

export type Pomodoro = ReturnType<typeof usePomodoro>;

/**
 * Pomodoro timer bound to the clock: every tick (each second and whenever the tab becomes visible)
 * recomputes the state from timestamps, so a backgrounded or throttled tab never drifts.
 *
 * Finished focus sessions are written to `timeEntries` BEFORE the new state is committed: if the write
 * fails, the state stays put and the next tick retries (writes are idempotent by start time).
 */
export function usePomodoro() {
  const [initial] = useState(() => ({ state: loadPomodoroState(), settings: loadPomodoroSettings() }));
  const [state, setState] = useState(initial.state);
  const [settings, setSettings] = useState(initial.settings);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string>();
  const latest = useRef(initial);
  const busy = useRef(false);

  const commit = useCallback((next: PomodoroState) => {
    latest.current = { ...latest.current, state: next };
    savePomodoroState(next);
    setState(next);
  }, []);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (busy.current) return;
      const base = latest.current.state;
      const r = advance(base, latest.current.settings, t);
      if (r.state === base) return;
      const last = r.finished.at(-1);
      const finish = () => {
        if (latest.current.state !== base) return; // changed meanwhile (stop, another tab)
        commit(r.state);
        if (last && t - last.endedAt < SIGNAL_WINDOW_MS) signalPhaseEnd(last.phase);
      };
      if (r.records.length === 0) {
        finish();
        return;
      }
      busy.current = true;
      addFocusRecords(r.records, t)
        .then(
          () => {
            setError(undefined);
            finish();
          },
          () => setError(SAVE_ERROR),
        )
        .finally(() => {
          busy.current = false;
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    // Another open tab changed the timer: follow it instead of keeping a stale copy.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== POMODORO_STATE_KEY) return;
      const next = loadPomodoroState();
      latest.current = { ...latest.current, state: next };
      setState(next);
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
  }, [commit]);

  const start = useCallback(
    async (target: FocusTarget) => {
      unlockSound(); // inside the click: browsers allow audio only after a user gesture
      const t = Date.now();
      try {
        await stopRunningTimers(t);
      } catch {
        setError('Не удалось остановить таймер учёта. Попробуйте ещё раз');
        return;
      }
      setError(undefined);
      commit(startFocus(latest.current.state, latest.current.settings, target, t));
      setNow(t);
    },
    [commit],
  );

  /**
   * Stops the current phase; spent focus time is recorded first, so a failed write keeps the timer.
   * Resolves to `false` when the timer could not be stopped.
   */
  const stopNow = useCallback(async (): Promise<boolean> => {
    const t = Date.now();
    const base = latest.current.state;
    const r = stop(base, t);
    try {
      await addFocusRecords(r.records, t);
    } catch {
      setError('Не удалось записать фокус-сессию. Попробуйте ещё раз');
      return false;
    }
    setError(undefined);
    if (latest.current.state === base) commit(r.state);
    setNow(t);
    return true;
  }, [commit]);

  const saveSettings = useCallback((next: PomodoroSettings) => {
    latest.current = { ...latest.current, settings: next };
    savePomodoroSettings(next);
    setSettings(next);
  }, []);

  return { state, settings, now, error, start, stop: stopNow, saveSettings };
}
