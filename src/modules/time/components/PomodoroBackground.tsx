import { useEffect } from 'react';
import { attachPomodoro } from './pomodoroRuntime';

/**
 * Mounted by the app shell on every page (`AppModule.Background`): a focus session ends with a signal
 * and is recorded in `timeEntries` even while the user is in another module. Renders nothing.
 */
export function PomodoroBackground() {
  useEffect(() => attachPomodoro(), []);
  return null;
}
