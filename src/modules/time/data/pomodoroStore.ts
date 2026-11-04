import { db } from '../../../core/db';
import { restoreSettings, restoreState, type PomodoroSettings, type PomodoroState } from '../logic/pomodoro';

/*
 * Pomodoro settings and the live timer state live in localStorage, not in Dexie:
 * the `settings` table belongs to other modules (docs/architecture.md), and the timer state is
 * per-device UI state. Finished focus sessions are written to `timeEntries` like any other time.
 */
const SETTINGS_KEY = 'lifeos.time.pomodoro.settings';
export const POMODORO_STATE_KEY = 'lifeos.time.pomodoro.state';

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the timer still works for this page view.
  }
}

export const loadPomodoroSettings = (): PomodoroSettings => restoreSettings(read(SETTINGS_KEY));
export const savePomodoroSettings = (s: PomodoroSettings): void => write(SETTINGS_KEY, s);
export const loadPomodoroState = (): PomodoroState => restoreState(read(POMODORO_STATE_KEY));
export const savePomodoroState = (s: PomodoroState): void => write(POMODORO_STATE_KEY, s);

export const RUNNING_SETTING_KEY = 'time.pomodoro.running';

/**
 * Mirrors the running phase into `settings` (`time.pomodoro.running` = `{ phase, startedAt, endsAt }`) so other
 * screens can show it without reading our localStorage. The key is removed while the timer is not running.
 * Best effort: a failed write must not stop the timer; the next change rewrites it.
 */
export async function syncRunningSetting(state: PomodoroState): Promise<void> {
  try {
    if (state.status === 'running') {
      const { phase, startedAt, endsAt } = state;
      await db.settings.put({ key: RUNNING_SETTING_KEY, value: { phase, startedAt, endsAt } });
    } else {
      await db.settings.delete(RUNNING_SETTING_KEY);
    }
  } catch {
    // ignore
  }
}
