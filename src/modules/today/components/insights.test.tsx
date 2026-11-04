import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { todayModule } from '../index';
import { ONBOARDING_DONE_KEY } from '../data/onboarding';
import { applyAsyncTimeout } from '../../../test/async';

// Full screens with live queries: wait up to the shared timeout, not the default 1 s (#169).
applyAsyncTimeout();

// These tests open «Сегодня»: the first-run onboarding (#41) is already done.
beforeEach(async () => {
  await db.settings.put({ key: ONBOARDING_DONE_KEY, value: true });
});

const base = { createdAt: 0, updatedAt: 0 };
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const key = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** `n` tracked days ending on 20 Nov: more sleep → more tasks and focus; workouts lower next-day energy. */
async function seed(n: number) {
  for (let i = 0; i < n; i++) {
    const d = 20 - n + 1 + i;
    const hours = 5 + (i % 4);
    await db.sleepLogs.add({
      id: `s${d}`,
      date: key(d),
      bedtime: at(d, 7) - hours * 3600_000,
      wakeTime: at(d, 7),
      quality: 3,
      ...base,
    });
    for (let t = 0; t < hours - 4; t++) {
      await db.tasks.add({ id: `t${d}-${t}`, title: 'x', priority: 2, tags: [], completedAt: at(d, 12, t), ...base });
    }
    await db.timeEntries.add({
      id: `p${d}`,
      categoryId: 'c',
      start: at(d, 9),
      end: at(d, 9, 5 * hours),
      date: key(d),
      source: 'pomodoro',
      ...base,
    });
    if (i % 2 === 0)
      await db.workoutLogs.add({ id: `w${d}`, date: key(d), type: 'Бег', durationMin: 60, rpe: 7, ...base });
    await db.checkIns.add({ id: `c${d + 1}`, date: key(d + 1), energy: i % 2 === 0 ? 2 : 4, focus: 3, ...base });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 21, 9, 0));
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([db.sleepLogs, db.tasks, db.timeEntries, db.workoutLogs, db.checkIns].map((t) => t.clear()));
});

describe('Инсайты', () => {
  it('Given ≥ 7 дней данных When я открываю «Инсайты» Then вижу связь «сон ↔ выполненные задачи следующего дня» с коэффициентом Пирсона и диаграммой рассеяния', async () => {
    await seed(8);
    renderAt('/today/insights');
    const card = await screen.findByRole('region', { name: 'Сон ↔ выполненные задачи следующего дня' });
    expect(await within(card).findByText(/Сильная положительная связь: r = 1,00/)).toBeInTheDocument();
    const plot = within(card).getByRole('img', { name: /Диаграмма рассеяния/ });
    expect(within(plot).getAllByTestId('scatter-point')).toHaveLength(8);
  });

  it('Given то же When экран открыт Then есть пары «сон ↔ фокус-минуты» и «тренировка ↔ энергия»', async () => {
    await seed(8);
    renderAt('/today/insights');
    const focus = await screen.findByRole('region', { name: 'Сон ↔ фокус-минуты' });
    expect(await within(focus).findByText(/положительная связь: r = 1,00/)).toBeInTheDocument();
    const workout = screen.getByRole('region', { name: 'Тренировка ↔ энергия на следующее утро' });
    expect(
      within(workout).getByText(/отрицательная связь: r = −1,00|отрицательная связь: r = -1,00/),
    ).toBeInTheDocument();
  });

  it('Given < 7 точек When экран открыт Then текст «Мало данных — нужно ещё N дней» вместо вывода', async () => {
    await seed(4);
    renderAt('/today/insights');
    const card = await screen.findByRole('region', { name: 'Сон ↔ выполненные задачи следующего дня' });
    expect(await within(card).findByText(/Мало данных — нужно ещё 3 дня/)).toBeInTheDocument();
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    expect(within(card).queryByText(/r =/)).not.toBeInTheDocument();
  });

  it('Given любой вывод When отображается Then с оговоркой «связь, а не причина»', async () => {
    await seed(8);
    renderAt('/today/insights');
    await screen.findAllByRole('img', { name: /Диаграмма рассеяния/ });
    for (const card of screen.getAllByRole('region')) {
      if (within(card).queryByText(/r =/)) expect(card).toHaveTextContent('связь, а не причина');
    }
    expect(screen.getAllByText(/связь, а не причина/)).toHaveLength(3);
  });

  it('says so when values do not change at all', async () => {
    for (let d = 1; d <= 7; d++) {
      await db.sleepLogs.add({ id: `s${d}`, date: key(d), bedtime: at(d, 0), wakeTime: at(d, 7), quality: 3, ...base });
    }
    renderAt('/today/insights');
    const card = await screen.findByRole('region', { name: 'Сон ↔ выполненные задачи следующего дня' });
    expect(await within(card).findByText(/вывода пока нет/)).toBeInTheDocument();
  });

  it('links to the insights from the Today screen', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /Инсайты/ })).toHaveAttribute('href', '/today/insights');
  });
});
