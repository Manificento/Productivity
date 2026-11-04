import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { HabitsPage } from '../HabitsPage';

const NOW = atLocalTime('2026-11-05', '20:00'); // Thursday; grid Mon 10/05 … Sun 11/08

async function addHabit(over = {}) {
  const h = newRecord(
    {
      name: 'Зал',
      schedule: { kind: 'weekdays' as const, weekdays: [1, 3, 5] },
      archived: false,
      color: '#22c55e',
      ...over,
    },
    atLocalTime('2026-10-01', '09:00'),
  );
  await db.habits.add(h);
  return h.id;
}

async function marks(habitId: string, dates: string[]) {
  await db.habitLogs.bulkAdd(dates.map((date) => newRecord({ habitId, date, done: true }, NOW - 1000)));
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/habits/*" element={<HabitsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all([db.habits.clear(), db.habitLogs.clear()]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HabitDetail', () => {
  it('история за 5 недель: при открытии привычки видна сетка пн–вс × 5 недель — выполнено / пропущено / не запланировано', async () => {
    const id = await addHabit();
    await marks(id, ['2026-10-05', '2026-10-07', '2026-11-02', '2026-11-04']);
    renderAt(`/habits/${id}`);

    const table = await screen.findByRole('table', { name: 'Календарь за 5 недель' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => within(r).getAllByRole('button').length === 7)).toBe(true);
    expect(screen.getByRole('button', { name: '5 октября: выполнено' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '9 октября: пропущено' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6 октября: не запланировано' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '8 ноября: впереди' })).toBeDisabled();
  });

  it('та же история: видны текущая и лучшая серия, процент за 7 и 30 дней', async () => {
    const id = await addHabit({ schedule: { kind: 'daily' } });
    // 10/20–10/24 (5 days), gap, 11/02–11/05 (4 days, today included)
    await marks(id, [
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
    renderAt(`/habits/${id}`);

    const term = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    await screen.findByText('Серия сейчас');
    expect(term('Серия сейчас')).toBe('🔥4');
    expect(term('Лучшая серия')).toBe('5');
    expect(term('За 7 дней')).toBe('57%'); // 10/30–11/05: 4 of 7
    expect(term('За 30 дней')).toBe('30%'); // 10/07–11/05: 9 of 30
  });

  it('прошлый день в сетке: тап переключает отметку за тот день', async () => {
    const id = await addHabit();
    const user = userEvent.setup();
    renderAt(`/habits/${id}`);

    await user.click(await screen.findByRole('button', { name: '2 ноября: пропущено' }));
    expect(await screen.findByRole('button', { name: '2 ноября: выполнено' })).toBeInTheDocument();
    let logs = await db.habitLogs.where('[habitId+date]').equals([id, '2026-11-02']).toArray();
    expect(logs.map((l) => l.done)).toEqual([true]);

    await user.click(screen.getByRole('button', { name: '2 ноября: выполнено' }));
    expect(await screen.findByRole('button', { name: '2 ноября: пропущено' })).toBeInTheDocument();
    logs = await db.habitLogs.where('[habitId+date]').equals([id, '2026-11-02']).toArray();
    expect(logs.map((l) => l.done)).toEqual([false]);
  });

  it('из списка: тап по названию открывает экран привычки, «← Все привычки» возвращает', async () => {
    await addHabit({ schedule: { kind: 'daily' }, name: 'Чтение' });
    const user = userEvent.setup();
    renderAt('/habits');
    await user.click(await screen.findByRole('link', { name: 'Открыть «Чтение»' }));
    expect(await screen.findByRole('heading', { name: 'Чтение' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '← Все привычки' }));
    expect(await screen.findByRole('heading', { name: 'Привычки' })).toBeInTheDocument();
  });

  it('привычки нет или она в архиве: понятное сообщение', async () => {
    const id = await addHabit({ archived: true });
    renderAt(`/habits/${id}`);
    expect(await screen.findByText(/Привычка не найдена/)).toBeInTheDocument();
  });

  it('ошибка записи: сообщение на русском', async () => {
    const id = await addHabit();
    const spy = vi.spyOn(db.habitLogs, 'add').mockRejectedValue(new Error('disk full'));
    const user = userEvent.setup();
    renderAt(`/habits/${id}`);
    await user.click(await screen.findByRole('button', { name: '2 ноября: пропущено' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить отметку'));
    spy.mockRestore();
  });
});
