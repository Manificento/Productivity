import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { todayModule } from '../index';
import { ONBOARDING_DONE_KEY } from '../data/onboarding';

function renderToday() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path={todayModule.path} element={<todayModule.Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

const QUESTION = 'Какое у тебя ближайшее важное событие?';

/** The real «Сегодня» screen (the loading placeholder has the same title, but no daily targets). */
async function screenToday() {
  expect(await screen.findByText(/Цели дня/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0)); // 4 Nov 2026, local time
  await Promise.all(db.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Онбординг', () => {
  it('Given первый запуск (нет событий и нет отметки «онбординг пройден») When открывается приложение Then вместо «Сегодня» — экран «Какое у тебя ближайшее важное событие?»', async () => {
    renderToday();
    expect(await screen.findByRole('heading', { name: QUESTION })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Сегодня' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Цели дня/)).not.toBeInTheDocument();
  });

  it('is not shown once onboarding is done, or to someone who already has events', async () => {
    await db.settings.put({ key: ONBOARDING_DONE_KEY, value: true });
    const { unmount } = renderToday();
    await screenToday();
    unmount();

    await db.settings.clear();
    await db.lifeEvents.add({
      id: 'e1',
      title: 'IELTS',
      type: 'exam',
      date: '2026-11-20',
      importance: 2,
      prepDays: 7,
      createdAt: 0,
      updatedAt: 0,
    });
    renderToday();
    await screenToday();
    expect(screen.queryByRole('heading', { name: QUESTION })).not.toBeInTheDocument();
  });

  it('Given я ввожу название, дату и важность When нажимаю «Дальше» Then создаётся LifeEvent и сразу показывается план на 10 дней', async () => {
    const user = userEvent.setup();
    renderToday();
    await screen.findByRole('heading', { name: QUESTION });
    await user.type(screen.getByLabelText('Название'), 'IELTS');
    await user.clear(screen.getByLabelText('Дата'));
    await user.type(screen.getByLabelText('Дата'), '2026-11-09');
    await user.click(screen.getByRole('radio', { name: 'Критичное' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    const plan = await screen.findByRole('table', { name: 'План на 10 дней' });
    expect(within(plan).getAllByText('подгот.').length).toBeGreaterThan(0);
    expect(within(plan).getByText('событие')).toBeInTheDocument();
    const events = await db.lifeEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'IELTS', date: '2026-11-09', importance: 3 });
  });

  it('shows what is missing instead of going on with an empty title', async () => {
    const user = userEvent.setup();
    renderToday();
    await screen.findByRole('heading', { name: QUESTION });
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(await screen.findByText('Введите название')).toBeInTheDocument();
    expect(await db.lifeEvents.count()).toBe(0);
  });

  it('Given план показан When я нажимаю «Начать» Then попадаю на «Сегодня», онбординг больше не показывается', async () => {
    const user = userEvent.setup();
    const { unmount } = renderToday();
    await screen.findByRole('heading', { name: QUESTION });
    await user.type(screen.getByLabelText('Название'), 'IELTS');
    await user.clear(screen.getByLabelText('Дата'));
    await user.type(screen.getByLabelText('Дата'), '2026-11-09');
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await screen.findByRole('table', { name: 'План на 10 дней' });

    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await screenToday();
    expect((await db.settings.get(ONBOARDING_DONE_KEY))?.value).toBe(true);

    unmount();
    renderToday();
    await screenToday();
    expect(screen.queryByRole('heading', { name: QUESTION })).not.toBeInTheDocument();
  });

  it('Given я нажимаю «Пропустить» When онбординг закрывается Then обычный экран «Сегодня», событие можно добавить позже', async () => {
    const user = userEvent.setup();
    renderToday();
    await screen.findByRole('heading', { name: QUESTION });
    await user.click(screen.getByRole('button', { name: 'Пропустить' }));

    await screenToday();
    expect(screen.getByRole('link', { name: /События/ })).toHaveAttribute('href', '/today/events');
    await waitFor(async () => expect((await db.settings.get(ONBOARDING_DONE_KEY))?.value).toBe(true));
    expect(await db.lifeEvents.count()).toBe(0);
  });
});
