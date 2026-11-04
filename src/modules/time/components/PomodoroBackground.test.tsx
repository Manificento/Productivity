import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { createDefaultCategories } from '../data/timeStore';
import { TimePage } from '../TimePage';
import { PomodoroBackground } from './PomodoroBackground';

const NOW = atLocalTime('2026-11-02', '09:00');

/** The shell: the module's background component next to the routes of all modules. */
function Shell() {
  return (
    <MemoryRouter initialEntries={['/time/pomodoro']}>
      <PomodoroBackground />
      <Routes>
        <Route path="/time/*" element={<TimePage />} />
        <Route path="/tasks" element={<h1>Задачи</h1>} />
      </Routes>
      <Link to="/tasks">В задачи</Link>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear(), db.tasks.clear(), db.settings.clear()]);
  await createDefaultCategories(NOW - 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PomodoroBackground', () => {
  it('Given идёт фокус-сессия When я перехожу в другой модуль и сессия заканчивается Then звучит сигнал и создаётся TimeEntry с source pomodoro', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(await screen.findByRole('button', { name: 'Начать фокус' }));
    await screen.findByText(/^Фокус · сессия/);

    await user.click(screen.getByRole('link', { name: 'В задачи' }));
    expect(await screen.findByRole('heading', { name: 'Задачи' })).toBeInTheDocument();
    expect(screen.queryByRole('timer', { name: 'Pomodoro' })).not.toBeInTheDocument();

    // The session ends while «Задачи» is open: the next tick (each second) records and signals it.
    vi.setSystemTime(NOW + 25 * 60_000);
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1), { timeout: 3000 });
    expect((await db.timeEntries.toArray())[0]).toMatchObject({
      source: 'pomodoro',
      start: NOW,
      end: NOW + 25 * 60_000,
    });
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
  });

  it('the background and the «Время» page share one timer: one record and one signal per session', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(await screen.findByRole('button', { name: 'Начать фокус' }));
    await screen.findByText(/^Фокус · сессия/);

    vi.setSystemTime(NOW + 25 * 60_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText(/^Перерыв · сессия/)).toBeInTheDocument();
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    // Give a second timer (the bug this guards against) a tick to record and signal too.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1100)));
    expect(await db.timeEntries.count()).toBe(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
