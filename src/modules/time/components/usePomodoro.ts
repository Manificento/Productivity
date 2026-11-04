import { useSyncExternalStore } from 'react';
import {
  getPomodoro,
  savePomodoroSettingsNow,
  startPomodoro,
  stopPomodoro,
  subscribePomodoro,
} from './pomodoroRuntime';

export type Pomodoro = ReturnType<typeof usePomodoro>;

/**
 * The page's Pomodoro timer (see `pomodoroRuntime`): every component using this hook sees the same timer,
 * and it keeps running on other modules' pages through `PomodoroBackground`.
 */
export function usePomodoro() {
  const { state, settings, now, error } = useSyncExternalStore(subscribePomodoro, getPomodoro);
  return {
    state,
    settings,
    now,
    error,
    start: startPomodoro,
    stop: stopPomodoro,
    saveSettings: savePomodoroSettingsNow,
  };
}
