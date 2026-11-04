import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { POMODORO_STATE_KEY, RUNNING_SETTING_KEY } from '../data/pomodoroStore';
import { attachPomodoro, startPomodoro, stopPomodoro } from './pomodoroRuntime';

const NOW = new Date(2026, 10, 2, 9, 0).getTime();
let detach: (() => void) | undefined;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  await Promise.all([db.settings.clear(), db.timeEntries.clear(), db.timeCategories.clear()]);
});
afterEach(() => {
  detach?.();
  detach = undefined;
  vi.useRealTimers();
});

const running = () => db.settings.get(RUNNING_SETTING_KEY);

describe('time.pomodoro.running', () => {
  it('Given я запускаю фокус When состояние меняется Then в settings { phase, startedAt, endsAt }, а после стопа ключ удалён', async () => {
    detach = attachPomodoro();
    await startPomodoro({ categoryId: 'c1' });
    await vi.waitFor(async () => {
      expect((await running())?.value).toEqual({ phase: 'work', startedAt: NOW, endsAt: NOW + 25 * 60_000 });
    });
    expect(await stopPomodoro()).toBe(true);
    await vi.waitFor(async () => expect(await running()).toBeUndefined());
  });

  it('Given таймер остановлен в другой вкладке When состояние приходит через storage Then ключ тоже обновлён', async () => {
    detach = attachPomodoro();
    await startPomodoro({ categoryId: 'c1' });
    await vi.waitFor(async () => expect(await running()).toBeDefined());
    localStorage.setItem(POMODORO_STATE_KEY, JSON.stringify({ status: 'idle', completedWork: 0 }));
    window.dispatchEvent(new StorageEvent('storage', { key: POMODORO_STATE_KEY }));
    await vi.waitFor(async () => expect(await running()).toBeUndefined());
  });
});
