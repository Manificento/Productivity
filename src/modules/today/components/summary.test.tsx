import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { todayModule } from '../index';

const base = { createdAt: 0, updatedAt: 0 };
const today = '2026-11-04';

function renderToday() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

const TABLES = [
  db.lifeEvents,
  db.projects,
  db.tasks,
  db.habits,
  db.habitLogs,
  db.timeCategories,
  db.timeEntries,
  db.sleepLogs,
  db.workoutLogs,
  db.checkIns,
  db.settings,
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0)); // Wednesday 4 Nov 2026, local noon
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(TABLES.map((t) => t.clear()));
});

describe('Сводка на «Сегодня»', () => {
  it('Given активное событие IELTS через 3 дня When я открываю «Сегодня» Then вверху «IELTS через 3 дня · Подготовка»', async () => {
    await db.lifeEvents.add({
      id: 'ielts',
      title: 'IELTS',
      type: 'exam',
      date: '2026-11-07',
      importance: 3,
      prepDays: 7,
      ...base,
    });
    renderToday();
    const banner = await screen.findByRole('link', { name: 'IELTS через 3 дня · Подготовка' });
    expect(banner).toHaveAttribute('href', '/today/events/ielts');
    const heading = screen.getByRole('heading', { name: 'Сегодня' });
    expect(heading.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(screen.getByRole('region', { name: 'Самочувствие' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('Given задачи на сегодня с оценками When экран открыт Then карточка «Задачи: план X / ёмкость Y мин» и топ-3 задачи (фокус-проект первым), ссылка на /tasks', async () => {
    await db.lifeEvents.add({
      id: 'ielts',
      title: 'IELTS',
      type: 'exam',
      date: '2026-11-07',
      importance: 3,
      prepDays: 7,
      projectId: 'eng',
      ...base,
    });
    await db.tasks.bulkAdd([
      { id: 't1', title: 'Отчёт', priority: 1, dueDate: today, estimateMin: 60, tags: [], ...base },
      { id: 't2', title: 'Эссе', priority: 4, dueDate: today, estimateMin: 45, projectId: 'eng', tags: [], ...base },
      { id: 't3', title: 'Письмо', priority: 2, dueDate: today, estimateMin: 15, tags: [], ...base },
      { id: 't4', title: 'Звонок', priority: 3, dueDate: today, estimateMin: 30, tags: [], ...base },
    ]);
    renderToday();
    const card = await screen.findByRole('region', { name: 'Задачи на сегодня' });
    // Prep phase keeps the default capacity of 360 minutes.
    expect(card).toHaveTextContent('План 150 / ёмкость 360 мин');
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Эссе'), expect.stringContaining('Отчёт'), expect.stringContaining('Письмо')]);
    expect(within(card).getByRole('link', { name: /Все задачи/ })).toHaveAttribute('href', '/tasks');
  });

  it('Given привычки на сегодня When экран открыт Then карточка «Привычки: 3 из 5», ссылка на /habits', async () => {
    await db.habits.bulkAdd(
      ['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id,
        name: id,
        schedule: { kind: 'daily' as const },
        archived: false,
        ...base,
      })),
    );
    await db.habitLogs.bulkAdd(
      ['a', 'b', 'c'].map((habitId) => ({ id: habitId, habitId, date: today, done: true, ...base })),
    );
    renderToday();
    const card = await screen.findByRole('region', { name: 'Привычки на сегодня' });
    expect(card).toHaveTextContent('Привычки: 3 из 5');
    expect(within(card).getByRole('link', { name: /Отметить привычки/ })).toHaveAttribute('href', '/habits');
  });

  it('Given идёт таймер или были фокус-сессии When экран открыт Then карточка с идущим таймером или «Фокус: 2 из 6»', async () => {
    // A normal day with a baseline of 6 focus sessions.
    await db.settings.put({ key: 'adaptation.baseline', value: { focusPomodoros: 6 } });
    await db.timeCategories.add({ id: 'study', name: 'Учёба', archived: false, ...base });
    const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m).getTime();
    await db.timeEntries.bulkAdd([
      { id: 'p1', categoryId: 'study', start: at(9), end: at(9, 25), date: today, source: 'pomodoro', ...base },
      { id: 'p2', categoryId: 'study', start: at(10), end: at(10, 25), date: today, source: 'pomodoro', ...base },
    ]);
    const { unmount } = renderToday();
    const card = await screen.findByRole('region', { name: 'Фокус' });
    expect(card).toHaveTextContent('Фокус: 2 из 6');
    expect(card).not.toHaveTextContent('Идёт таймер');
    unmount();

    await db.timeEntries.add({
      id: 'run',
      categoryId: 'study',
      start: at(11, 15),
      date: today,
      source: 'timer',
      ...base,
    });
    renderToday();
    expect(await screen.findByText('⏱ Идёт таймер · Учёба, с 11:15')).toBeInTheDocument();
  });

  it('Given сон прошлой ночи и тренировки сегодня When экран открыт Then факт против цели', async () => {
    const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
    await db.sleepLogs.add({ id: 's', date: today, bedtime: at(3, 23), wakeTime: at(4, 6), quality: 3, ...base });
    await db.workoutLogs.add({ id: 'w', date: today, type: 'Бег', durationMin: 30, rpe: 6, ...base });
    renderToday();
    const card = await screen.findByRole('region', { name: 'Сон и тренировка' });
    expect(card).toHaveTextContent('7 ч · цель 7,5 ч');
    expect(card).toHaveTextContent('Бег, 30 мин, RPE 6 · предел: любая');
  });

  it('Given данных блока нет When экран открыт Then короткая подсказка со ссылкой на модуль вместо пустой карточки', async () => {
    renderToday();
    expect(await screen.findByText('На сегодня задач нет.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Добавить' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByText('На сегодня привычек нет.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Настроить' })).toHaveAttribute('href', '/habits');
    expect(screen.getByText('Фокус-сессий сегодня ещё не было.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Запустить' })).toHaveAttribute('href', '/time');
    expect(screen.getByText('Сон и тренировки сегодня не записаны.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Записать' })).toHaveAttribute('href', '/health');
    for (const name of ['Задачи на сегодня', 'Привычки на сегодня', 'Фокус', 'Сон и тренировка']) {
      expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: /через/ })).not.toBeInTheDocument();
  });
});
