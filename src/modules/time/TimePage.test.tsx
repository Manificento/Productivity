import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { atLocalTime } from '../../core/logging/sleepTime';
import { TimePage } from './TimePage';
import { createDefaultCategories } from './data/timeStore';

const NOW = atLocalTime('2026-11-02', '09:00');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/time/*" element={<TimePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimePage', () => {
  it('переключает вкладки «Таймер» и «Pomodoro»', async () => {
    const user = userEvent.setup();
    renderAt('/time');
    expect(await screen.findByRole('button', { name: 'Добавить стартовый набор' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Pomodoro' }));
    expect(await screen.findByText(/Фокус-сессии пишутся в учёт времени/)).toBeInTheDocument();
  });

  it('фокус-сессия продолжается на вкладке «Таймер»: по окончании запись создана и звучит сигнал', async () => {
    await createDefaultCategories(NOW - 1000);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const user = userEvent.setup();
    renderAt('/time/pomodoro');
    await user.click(await screen.findByRole('button', { name: 'Начать фокус' }));
    await user.click(screen.getByRole('link', { name: 'Таймер' }));
    expect(await screen.findByRole('status', { name: 'Фокус-сессия' })).toHaveTextContent('осталось 25:00');

    vi.setSystemTime(NOW + 25 * 60_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(async () => expect(await db.timeEntries.count()).toBe(1));
    expect((await db.timeEntries.toArray())[0]).toMatchObject({ source: 'pomodoro', start: NOW });
    await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
  });

  it('запуск таймера учёта во время фокуса останавливает фокус и сохраняет его минуты', async () => {
    await createDefaultCategories(NOW - 1000);
    const user = userEvent.setup();
    renderAt('/time/pomodoro');
    await user.click(await screen.findByRole('button', { name: 'Начать фокус' }));
    await user.click(screen.getByRole('link', { name: 'Таймер' }));

    vi.setSystemTime(NOW + 10 * 60_000);
    await user.click(await screen.findByRole('button', { name: 'Работа' }));

    await screen.findByRole('timer', { name: 'Идущий таймер' });
    expect(screen.queryByRole('status', { name: 'Фокус-сессия' })).not.toBeInTheDocument();
    const entries = (await db.timeEntries.toArray()).sort((a, b) => a.start - b.start);
    expect(entries.map((e) => [e.source, e.start, e.end])).toEqual([
      ['pomodoro', NOW, NOW + 10 * 60_000],
      ['timer', NOW + 10 * 60_000, undefined],
    ]);
  });

  it('фокус не удалось остановить: таймер учёта не запускается, показана ошибка', async () => {
    await createDefaultCategories(NOW - 1000);
    const user = userEvent.setup();
    renderAt('/time/pomodoro');
    await user.click(await screen.findByRole('button', { name: 'Начать фокус' }));
    await user.click(screen.getByRole('link', { name: 'Таймер' }));

    vi.setSystemTime(NOW + 10 * 60_000);
    const add = vi.spyOn(db.timeEntries, 'add').mockRejectedValue(new Error('disk full'));
    await user.click(await screen.findByRole('button', { name: 'Работа' }));

    expect(await screen.findByText('Не удалось сохранить. Попробуйте ещё раз')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Фокус-сессия' })).toHaveTextContent('Идёт Pomodoro (фокус)');
    expect(screen.queryByRole('timer', { name: 'Идущий таймер' })).not.toBeInTheDocument();
    add.mockRestore();
  });
});
