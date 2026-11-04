import { liveQuery } from 'dexie';
import { db } from '../../../core/db';
import { restoreSettings, restoreState, type PomodoroSettings, type PomodoroState } from '../logic/pomodoro';

/*
 * Pomodoro durations live in `settings` (`time.pomodoro`, part of the backup); the live timer state stays in
 * localStorage as per-device data. A mirror of the running phase also goes to `settings`
 * (`time.pomodoro.running`, see `syncRunningSetting`). Finished focus sessions go to `timeEntries`.
 */
/** Legacy location of the durations (before #101); migrated into `settings` on first load. */
const LEGACY_SETTINGS_KEY = 'lifeos.time.pomodoro.settings';
/** `settings` key of the durations: part of the backup, moves with it to a new device. */
export const SETTINGS_KEY = 'time.pomodoro';
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

/**
 * Reads the durations from `settings`. If there is no `time.pomodoro` yet but the old localStorage value exists,
 * moves it into `settings` and removes the old key.
 */
export async function loadPomodoroSettings(): Promise<PomodoroSettings> {
  const rec = await db.settings.get(SETTINGS_KEY);
  if (rec) return restoreSettings(rec.value);
  const legacy = read(LEGACY_SETTINGS_KEY);
  if (legacy === undefined) return restoreSettings(undefined);
  const migrated = restoreSettings(legacy);
  await db.settings.put({ key: SETTINGS_KEY, value: migrated });
  try {
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // blocked storage: the settings record already wins next time
  }
  return migrated;
}

export const savePomodoroSettings = (s: PomodoroSettings): Promise<unknown> =>
  db.settings.put({ key: SETTINGS_KEY, value: s });

/**
 * Calls `onChange` with the current durations and again whenever they change (save, backup import).
 * If the first read fails, `onError` is called and live updates still start.
 */
export function watchPomodoroSettings(onChange: (s: PomodoroSettings) => void, onError: () => void): () => void {
  let active = true;
  let sub: { unsubscribe(): void } | undefined;
  const subscribe = () => {
    if (!active) return;
    sub = liveQuery(() => db.settings.get(SETTINGS_KEY)).subscribe({
      next: (rec) => active && onChange(restoreSettings(rec?.value)),
      error: () => active && onError(),
    });
  };
  loadPomodoroSettings().then(
    (first) => {
      if (active) onChange(first);
      subscribe();
    },
    () => {
      if (active) onError();
      subscribe();
    },
  );
  return () => {
    active = false;
    sub?.unsubscribe();
  };
}
export const loadPomodoroState = (): PomodoroState => restoreState(read(POMODORO_STATE_KEY));
export const savePomodoroState = (s: PomodoroState): void => write(POMODORO_STATE_KEY, s);

export const RUNNING_SETTING_KEY = 'time.pomodoro.running';

/**
 * Mirrors the running phase into `settings` (`time.pomodoro.running` = `{ phase, startedAt, endsAt }`) so other
 * screens can show it without reading our localStorage. The key is removed while the timer is not running.
 * Best effort: a failed write must not stop the timer; the key is re-synced on every change and on attach.
 * Readers must treat `endsAt <= now` as «не идёт» (the app may have been closed past the end).
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
