import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { HabitsPage } from '../HabitsPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/habits']}>
      <Routes>
        <Route path="/habits/*" element={<HabitsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(atLocalTime('2026-11-05', '09:00'));
  await Promise.all([db.habits.clear(), db.habitLogs.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('стартовый набор привычек', () => {
  it('привычек нет: при открытии «Привычки» видно предложение с выбором галочками', async () => {
    renderPage();
    const offer = await screen.findByRole('group', { name: /Отметьте привычки/ });
    const boxes = within(offer).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label')?.querySelector('span')?.textContent)).toEqual([
      'Медитация',
      'Чтение 20 мин',
      'Английский',
      'Тренировка',
      'Отбой вовремя',
    ]);
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  });

  it('выбрал три и нажал «Добавить»: создаются ровно три привычки', async () => {
    const user = userEvent.setup();
    renderPage();
    for (const name of ['Медитация', 'Английский', 'Тренировка']) {
      await user.click(await screen.findByRole('checkbox', { name: new RegExp(`^${name}`) }));
    }
    await user.click(screen.getByRole('button', { name: 'Добавить (3)' }));

    expect(await screen.findByRole('button', { name: 'Отметить «Медитация»' })).toBeInTheDocument();
    const habits = (await db.habits.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(habits.map((h) => [h.name, h.schedule.kind, h.archived])).toEqual([
      ['Медитация', 'daily', false],
      ['Английский', 'daily', false],
      ['Тренировка', 'timesPerWeek', false],
    ]);
    expect(screen.queryByRole('group', { name: /Отметьте привычки/ })).not.toBeInTheDocument();
  });

  it('без нажатия «Добавить» ничего не создаётся', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: /^Медитация/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Чтение 20 мин/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Медитация/ })); // untick
    expect(screen.getByRole('button', { name: 'Добавить (1)' })).toBeEnabled();
    expect(await db.habits.count()).toBe(0);
  });

  it('ошибка сохранения: сообщение на русском, ничего не создано', async () => {
    const spy = vi.spyOn(db.habits, 'bulkAdd').mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: /^Медитация/ }));
    await user.click(screen.getByRole('button', { name: 'Добавить (1)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить');
    spy.mockRestore();
    expect(await db.habits.count()).toBe(0);
  });
});
