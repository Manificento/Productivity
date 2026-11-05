import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import { atLocalTime } from '../../core/logging/sleepTime';
import { MeditationPage } from './MeditationPage';

const NOW = atLocalTime('2026-11-03', '08:00');

function setup() {
  return {
    user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
    ...render(
      <MemoryRouter>
        <MeditationPage />
      </MemoryRouter>,
    ),
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
  await db.meditationSessions.clear();
});
afterEach(() => vi.useRealTimers());

describe('Медитация', () => {
  it('Given пустой блок When я открываю «Медитация» Then выбор длительности 3 / 5 / 10 / 20 мин и паттерна; кнопка «Начать» ≥ 44 px', async () => {
    setup();
    for (const m of ['3 мин', '5 мин', '10 мин', '20 мин'])
      expect(screen.getByRole('radio', { name: m })).toBeInTheDocument();
    for (const p of ['4-7-8', 'Коробка 4-4-4-4', 'Без паттерна'])
      expect(screen.getByRole('radio', { name: p })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toHaveClass('min-h-11');
  });

  it('Given сессия идёт When время идёт Then круг дыхания анимируется по паттерну, остаток времени виден; пауза вкладки отсчёт не ломает', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    expect(screen.getByLabelText('Осталось времени')).toHaveTextContent('05:00');
    const circle = screen.getByTestId('breath-circle');
    expect(circle).toHaveTextContent('Вдох');
    const before = circle.style.transform;
    await act(async () => {
      vi.setSystemTime(NOW + 5000);
      vi.advanceTimersByTime(250);
    });
    expect(circle).toHaveTextContent('Задержка');
    expect(circle.style.transform).not.toBe(before);
    // вкладка «заснула» на 2 минуты: один тик — и остаток верный
    await act(async () => {
      vi.setSystemTime(NOW + 120_000);
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByLabelText('Осталось времени')).toHaveTextContent('03:00');
  });

  it('Given таймер дошёл до нуля When сессия завершается Then сигнал и запись в meditationSessions с длительностью и видом', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: '3 мин' }));
    await user.click(screen.getByRole('radio', { name: 'Коробка 4-4-4-4' }));
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await act(async () => {
      vi.setSystemTime(NOW + 180_000);
      vi.advanceTimersByTime(250);
    });
    expect(await screen.findByText('Сессия завершена и записана.')).toBeInTheDocument();
    expect(vibrate).toHaveBeenCalledTimes(1);
    const rows = await db.meditationSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-11-03',
      durationMin: 3,
      kind: 'breathing',
      pattern: 'box',
      completed: true,
    });
  });

  it('Given прерванная сессия ≥ 1 мин When я завершаю Then она сохраняется с пометкой; короче минуты — нет', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await act(async () => {
      vi.setSystemTime(NOW + 30_000);
    });
    await user.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(await screen.findByText(/не записана/)).toBeInTheDocument();
    expect(await db.meditationSessions.count()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await act(async () => {
      vi.setSystemTime(NOW + 30_000 + 150_000);
    });
    await user.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(await screen.findByText(/прервана/)).toBeInTheDocument();
    const rows = await db.meditationSessions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ durationMin: 2, completed: false });
  });

  it('Given сессии за неделю When я открываю историю Then минуты по дням и серия дней подряд', async () => {
    for (const [date, min] of [
      ['2026-11-03', 5],
      ['2026-11-02', 10],
    ] as const)
      await db.meditationSessions.add(
        newRecord({ date, startedAt: NOW, durationMin: min, kind: 'breathing' as const, completed: true }, NOW),
      );
    setup();
    expect(await screen.findByTestId('streak')).toHaveTextContent('2');
    const list = within(screen.getByRole('list', { name: 'Минуты по дням' }));
    expect(list.getByText('10 мин')).toBeInTheDocument();
    expect(list.getByText('5 мин')).toBeInTheDocument();
  });

  it('Given нет сессий Then пустое состояние истории', async () => {
    setup();
    expect(await screen.findByText(/Пока нет сессий/)).toBeInTheDocument();
  });

  it('Given я ушёл со страницы через 2 минуты When компонент размонтирован Then прерванная сессия сохранена', async () => {
    const { user, unmount } = setup();
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await act(async () => {
      vi.setSystemTime(NOW + 120_000);
    });
    unmount();
    await vi.waitFor(async () => expect(await db.meditationSessions.count()).toBe(1));
    expect((await db.meditationSessions.toArray())[0]).toMatchObject({ durationMin: 2, completed: false });
  });

  it('Given запись не удалась When я завершаю сессию Then понятная ошибка и кнопка «Закрыть»', async () => {
    vi.spyOn(db.meditationSessions, 'add').mockRejectedValueOnce(new Error('boom'));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await act(async () => {
      vi.setSystemTime(NOW + 120_000);
    });
    await user.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(await screen.findByText('Не удалось сохранить сессию.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  });
});
