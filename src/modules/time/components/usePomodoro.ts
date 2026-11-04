import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPomodoroSettings,
  loadPomodoroState,
  savePomodoroSettings,
  savePomodoroState,
} from '../data/pomodoroStore';
import { addFocusRecords, stopRunningTimers } from '../data/timeStore';
import {
  advance,
  startFocus,
  stop,
  type FocusRecord,
  type FocusTarget,
  type PomodoroSettings,
  type PomodoroState,
} from '../logic/pomodoro';
import { signalPhaseEnd } from './signal';

/** Phases that ended longer ago than this (e.g. the app was closed) end silently. */
const SIGNAL_WINDOW_MS = 2 * 60_000;
const SAVE_ERROR = 'Не удалось записать фокус-сессию в учёт времени. Попробуйте ещё раз';

/**
 * Pomodoro timer bound to the clock: every tick (each second and whenever the tab becomes visible)
 * recomputes the state from timestamps, so a backgrounded or throttled tab never drifts.
 */
export function usePomodoro() {
  const [initial] = useState(() => ({ state: loadPomodoroState(), settings: loadPomodoroSettings() }));
  const [state, setState] = useState(initial.state);
  const [settings, setSettings] = useState(initial.settings);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string>();
  const latest = useRef(initial);

  const commit = useCallback((next: PomodoroState) => {
    latest.current = { ...latest.current, state: next };
    savePomodoroState(next);
    setState(next);
  }, []);

  const record = useCallback((records: FocusRecord[], at: number) => {
    if (records.length === 0) return;
    addFocusRecords(records, at).then(
      () => setError(undefined),
      () => setError(SAVE_ERROR),
    );
  }, []);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      const r = advance(latest.current.state, latest.current.settings, t);
      if (r.state !== latest.current.state) commit(r.state);
      record(r.records, t);
      const last = r.finished.at(-1);
      if (last && t - last.endedAt < SIGNAL_WINDOW_MS) signalPhaseEnd(last.phase);
      setNow(t);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [commit, record]);

  const start = useCallback(
    async (target: FocusTarget) => {
      const t = Date.now();
      try {
        await stopRunningTimers(t);
      } catch {
        setError(SAVE_ERROR);
        return;
      }
      commit(startFocus(latest.current.state, latest.current.settings, target, t));
      setNow(t);
    },
    [commit],
  );

  const stopNow = useCallback(() => {
    const t = Date.now();
    const r = stop(latest.current.state, t);
    commit(r.state);
    record(r.records, t);
    setNow(t);
  }, [commit, record]);

  const saveSettings = useCallback((next: PomodoroSettings) => {
    latest.current = { ...latest.current, settings: next };
    savePomodoroSettings(next);
    setSettings(next);
  }, []);

  return { state, settings, now, error, start, stop: stopNow, saveSettings };
}
