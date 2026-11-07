import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../core/db';
import { newRecord } from '../../core/ids';
import { importTasks } from '../../core/logging/tasks';
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
  it('Given сумма опыта When я смотрю экран Then уровень и прогресс до следующего', async () => {
    await db.workoutLogs.bulkAdd(
      Array.from({ length: 7 }, (_, i) =>
        newRecord({ date: `2026-10-0${i + 1}`, type: 'run', durationMin: 30, rpe: 5 }, NOW),
      ),
    );
    open();
    // 7 × 15 = 105 XP: level 1 costs 100, so level 2 with 5 of 150 done
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('2'));
    expect(screen.getByTestId('level-progress')).toHaveTextContent('5 / 150 XP до уровня 3');
  });

  it('Given пустая база When я открываю блок Then уровень 1 и подсказка, что даёт опыт', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('1'));
    expect(screen.getByText('Пока нет опыта. Он начисляется за:')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Что даёт опыт' })).toHaveTextContent('Тренировка');
  });

  it('Given записи в таблицах блоков When я открываю «Прогресс» Then опыт = сумма по правилам xp.ts, за сегодня и за 7 дней', async () => {
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

  it('Given импорт истории When открываю «Прогресс» Then строка «Перенесено из истории» и разовое сообщение об уровне', async () => {
    try {
      localStorage.removeItem('progress.importAck');
    } catch {
      /* storage may be unavailable */
    }
    await db.tasks.bulkAdd(
      Array.from({ length: 30 }, (_, i) =>
        newRecord(
          {
            title: `t${i}`,
            priority: 4 as const,
            tags: [],
            completedAt: atLocalTime('2026-10-01', '10:00'),
            source: 'todoist' as const,
            externalId: `e${i}`,
          },
          NOW,
        ),
      ),
    );
    const { unmount } = open();
    await waitFor(() =>
      expect(screen.getByTestId('xp-imported')).toHaveTextContent('Перенесено из истории: 100 очков'),
    );
    expect(screen.getByText('Твоя история учтена: уровень 2')).toBeInTheDocument();
    unmount();
    const rows = Array.from({ length: 30 }, (_, i) => ({
      externalId: `x${i}`,
      title: `r${i}`,
      completedAt: atLocalTime('2026-10-02', '10:00'),
    }));
    await importTasks({ projects: [], tasks: rows }, { source: 'todoist' });
    await importTasks({ projects: [], tasks: rows }, { source: 'todoist' });
    open();
    await waitFor(() => expect(screen.getByTestId('xp-imported')).toBeInTheDocument());
    expect(screen.queryByText(/Твоя история учтена/)).not.toBeInTheDocument();
    // two days at the cap; the second import of the same externalIds updated rows, it did not add experience
    expect(screen.getByTestId('xp-imported')).toHaveTextContent('Перенесено из истории: 200 очков');
  });
});
