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

  it('Given фокус идёт When фаза сменилась на перерыв, а затем перерыв кончился Then phase = shortBreak с новыми метками, потом ключ удалён', async () => {
    await db.timeCategories.add({ id: 'c1' } as never);
    detach = attachPomodoro();
    await startPomodoro({ categoryId: 'c1' });
    const t1 = NOW + 25 * 60_000;
    vi.setSystemTime(t1);
    await vi.waitFor(
      async () =>
        expect((await running())?.value).toEqual({ phase: 'shortBreak', startedAt: t1, endsAt: t1 + 5 * 60_000 }),
      { timeout: 4000 },
    );
    vi.setSystemTime(t1 + 5 * 60_000);
    await vi.waitFor(async () => expect(await running()).toBeUndefined(), { timeout: 4000 });
  });

  it('Given в settings осталась «идущая» сессия, а таймер не идёт When приложение открывается Then ключ удалён', async () => {
    await db.settings.put({ key: RUNNING_SETTING_KEY, value: { phase: 'work', startedAt: NOW, endsAt: NOW + 1 } });
    detach = attachPomodoro();
    await vi.waitFor(async () => expect(await running()).toBeUndefined());
  });
});
