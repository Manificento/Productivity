import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { atLocalTime } from '../../../core/logging/sleepTime';
import { ProgressPage } from '../ProgressPage';
import { QUEST_BONUS_XP } from '../logic/quests';

const NOW = atLocalTime('2026-11-03', '12:00');

async function open(tab: 'Навыки' | 'Квесты') {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <MemoryRouter>
      <ProgressPage />
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole('radio', { name: tab }));
  return view;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(() => vi.useRealTimers());

describe('Навыки и квесты', () => {
  it('Given опыт по источникам When я открываю «Навыки» Then шесть навыков — Дела, Тело, Сон, Питание, Ум, Покой — с уровнями по вкладу блоков', async () => {
    await db.workoutLogs.bulkAdd(
      Array.from({ length: 7 }, () => newRecord({ date: '2026-11-03', type: 'run', durationMin: 30, rpe: 5 }, NOW)),
    );
    await open('Навыки');
    const list = await screen.findByRole('list', { name: 'Навыки' });
    expect(list.querySelectorAll('li')).toHaveLength(6);
    for (const name of ['Дела', 'Тело', 'Сон', 'Питание', 'Ум', 'Покой']) expect(list).toHaveTextContent(name);
    expect(screen.getByTestId('skill-body-level')).toHaveTextContent('2');
    expect(screen.getByTestId('skill-calm-level')).toHaveTextContent('1');
  });

  it('Given цели дня When я открываю «Квесты» Then три квеста из DailyTargets', async () => {
    await open('Квесты');
    const list = await screen.findByRole('list', { name: 'Квесты дня' });
    await waitFor(() => expect(list.querySelectorAll('li')).toHaveLength(3));
    expect(list).toHaveTextContent(/фокус-сесси/);
    expect(list).toHaveTextContent(/Отбой до \d\d:\d\d/);
    expect(list).toHaveTextContent(/Медитация \d+ мин/);
  });

  it('Given квест выполнен по данным таблиц When день идёт Then бонус опыта записан в xpEvents один раз', async () => {
    await db.meditationSessions.add(
      newRecord(
        { date: '2026-11-03', startedAt: NOW, durationMin: 60, kind: 'breathing' as const, completed: true },
        NOW,
      ),
    );
    const first = await open('Квесты');
    await waitFor(() => expect(screen.getByTestId('quest-meditation')).toHaveTextContent('Готово'));
    await waitFor(async () => expect(await db.xpEvents.count()).toBe(1));
    // opening the screen again (a second pass over the same data) adds nothing
    first.unmount();
    await open('Квесты');
    await waitFor(() => expect(screen.getByTestId('quest-meditation')).toHaveTextContent('Готово'));
    await new Promise((r) => setTimeout(r, 50));
    const events = await db.xpEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: '2026-11-03',
      source: 'quest',
      questId: 'meditation',
      amount: QUEST_BONUS_XP,
    });
  });

  it('Given фаза event When я смотрю квесты Then только «ключевые привычки» и «дыхание 5 мин», без тренировок', async () => {
    await db.lifeEvents.add(
      newRecord(
        { title: 'Экзамен', type: 'exam' as const, date: '2026-11-03', importance: 3 as const, prepDays: 7 },
        NOW,
      ),
    );
    await open('Квесты');
    const list = await screen.findByRole('list', { name: 'Квесты дня' });
    await waitFor(() => expect(list.querySelectorAll('li')).toHaveLength(2));
    expect(list).toHaveTextContent('Ключевые привычки');
    expect(list).toHaveTextContent('Дыхание 5 мин');
    expect(list).not.toHaveTextContent(/тренировк/i);
  });

  it('Given квест выполнен When «Квесты» не открывали Then бонус всё равно записан', async () => {
    await db.meditationSessions.add(
      newRecord(
        { date: '2026-11-03', startedAt: NOW, durationMin: 60, kind: 'breathing' as const, completed: true },
        NOW,
      ),
    );
    render(
      <MemoryRouter>
        <ProgressPage />
      </MemoryRouter>,
    );
    await waitFor(async () => expect(await db.xpEvents.count()).toBe(1));
    expect(screen.getByTestId('level')).toBeInTheDocument(); // still on «Обзор»
  });

  it('Given запись сна сегодняшним утром с отбоем вчера в 22:30 When открыт экран Then бонус «отбой» записан на вчера, сегодняшний квест не отмечен', async () => {
    await db.sleepLogs.add(
      newRecord(
        {
          date: '2026-11-03',
          bedtime: atLocalTime('2026-11-02', '22:30'),
          wakeTime: atLocalTime('2026-11-03', '07:00'),
          quality: 4,
        },
        NOW,
      ),
    );
    await open('Квесты');
    await waitFor(async () => {
      const events = await db.xpEvents.toArray();
      expect(events.some((e) => e.date === '2026-11-02' && e.questId === 'bedtime')).toBe(true);
    });
    expect(screen.getByTestId('quest-bedtime')).not.toHaveTextContent('Готово');
    expect(screen.getByTestId('quest-bedtime')).toHaveTextContent('Засчитается утром');
  });
});
