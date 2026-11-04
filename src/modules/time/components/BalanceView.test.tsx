import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { toDateKey } from '../../../core/dates';
import { createDefaultCategories, listCategories } from '../data/timeStore';
import { BalanceView } from './BalanceView';

// Thursday 2026-11-05, 18:00
const NOW = atLocalTime('2026-11-05', '18:00');

async function addEntry(name: string, day: string, from: string, to: string) {
  const c = (await listCategories()).find((x) => x.name === name);
  const start = atLocalTime(day, from);
  await db.timeEntries.add(
    newRecord({
      categoryId: c!.id,
      start,
      end: atLocalTime(day, to),
      date: toDateKey(start),
      source: 'timer' as const,
    }),
  );
}

function renderBalance() {
  return render(
    <MemoryRouter initialEntries={['/time/balance']}>
      <Routes>
        <Route path="/time/balance" element={<BalanceView />} />
        <Route path="/time" element={<h1>Таймер открыт</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all([db.timeCategories.clear(), db.timeEntries.clear()]);
  await createDefaultCategories(NOW - 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BalanceView', () => {
  it('записи за неделю: видны горизонтальные столбцы по категориям за день и за неделю (SVG)', async () => {
    await addEntry('Работа', '2026-11-02', '09:00', '12:00');
    await addEntry('Учёба', '2026-11-05', '10:00', '11:30');
    renderBalance();

    const day = await screen.findByRole('list', { name: 'Сегодня по категориям' });
    expect(
      within(day)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Учёба']);
    expect(within(day).getByText('1 ч 30 мин')).toBeInTheDocument();

    const week = screen.getByRole('list', { name: 'Неделя по категориям' });
    const items = within(week).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual(['Работа', 'Учёба']);
    const bars = items.map((li) => li.querySelector('svg rect[data-testid="bar"]'));
    expect(bars.map((b) => b?.getAttribute('width'))).toEqual(['100', '50']);
    expect(screen.getByText('Неделя · 4 ч 30 мин')).toBeInTheDocument();
    expect(screen.getByText('Сегодня · 1 ч 30 мин')).toBeInTheDocument();
  });

  it('есть прошлая неделя: у каждой категории видно изменение «+1 ч 20 мин» / «−40 мин»', async () => {
    await addEntry('Работа', '2026-11-02', '09:00', '12:00');
    await addEntry('Учёба', '2026-11-04', '09:00', '10:00');
    await addEntry('Работа', '2026-10-27', '09:00', '10:40');
    await addEntry('Учёба', '2026-10-28', '09:00', '10:40');
    renderBalance();

    const week = await screen.findByRole('list', { name: 'Неделя по категориям' });
    expect(within(within(week).getByRole('listitem', { name: 'Работа' })).getByText('+1 ч 20 мин')).toBeInTheDocument();
    expect(within(within(week).getByRole('listitem', { name: 'Учёба' })).getByText('−40 мин')).toBeInTheDocument();
    expect(screen.getByText('Изменение — к тем же дням прошлой недели.')).toBeInTheDocument();
  });

  it('прошлой недели нет: изменения не показываются', async () => {
    await addEntry('Работа', '2026-11-02', '09:00', '12:00');
    renderBalance();
    await screen.findByRole('list', { name: 'Неделя по категориям' });
    expect(screen.queryByText(/без изменений|^\+|^−/)).not.toBeInTheDocument();
  });

  it('сегодня записей нет, а за неделю есть: день показывает пустое состояние', async () => {
    await addEntry('Работа', '2026-11-02', '09:00', '12:00');
    renderBalance();
    expect(await screen.findByText('Сегодня записей пока нет.')).toBeInTheDocument();
  });

  it('записей нет: пустое состояние со ссылкой на таймер', async () => {
    const user = userEvent.setup();
    renderBalance();
    expect(await screen.findByText(/записей нет/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Открыть таймер' }));
    expect(screen.getByRole('heading', { name: 'Таймер открыт' })).toBeInTheDocument();
  });
});
