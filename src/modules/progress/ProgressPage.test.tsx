import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import { atLocalTime } from '../../core/logging/sleepTime';
import { ProgressPage } from './ProgressPage';
import { XP_RULES } from './logic/xp';

const NOW = atLocalTime('2026-11-03', '08:00');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all([db.habitLogs.clear(), db.tasks.clear(), db.workoutLogs.clear()]);
});
afterEach(() => vi.useRealTimers());

const open = () =>
  render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  );

describe('Прогресс', () => {
  it('Given пустая база When я открываю блок Then уровень 1 и подсказка, что даёт опыт', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('1'));
    expect(screen.getByText('Пока нет опыта. Он начисляется за:')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Что даёт опыт' })).toHaveTextContent('Тренировка');
  });

  it('Given записи в таблицах блоков When я открываю «Прогресс» Then опыт за сегодня и неделю, уровень растёт', async () => {
    await db.workoutLogs.add(newRecord({ date: '2026-11-03', type: 'run', durationMin: 30, rpe: 5 }, NOW));
    await db.habitLogs.add(newRecord({ habitId: 'h', date: '2026-11-01', done: true }, NOW));
    open();
    await waitFor(() => expect(screen.getByTestId('xp-today')).toHaveTextContent(`${XP_RULES.workout} XP`));
    expect(screen.getByTestId('xp-week')).toHaveTextContent(`${XP_RULES.workout + XP_RULES.habit} XP`);
    expect(screen.queryByText('Пока нет опыта. Он начисляется за:')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(XP_RULES.workout + XP_RULES.habit));
  });

  it('Given снятие отметки или удаление записи When данные изменились Then опыт пересчитан', async () => {
    const id = await db.workoutLogs.add(newRecord({ date: '2026-11-03', type: 'run', durationMin: 30, rpe: 5 }, NOW));
    open();
    await waitFor(() => expect(screen.getByTestId('xp-total')).toHaveTextContent(`${XP_RULES.workout} XP`));
    await db.workoutLogs.delete(id);
    await waitFor(() => expect(screen.getByTestId('xp-total')).toHaveTextContent('0 XP'));
  });
});
