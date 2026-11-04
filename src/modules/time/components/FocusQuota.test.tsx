import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BASELINE_SETTING_KEY, DEFAULT_BASELINE } from '../../../core/adaptation/rules';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type { LifeEvent } from '../../../core/types';
import { createDefaultCategories, listCategories } from '../data/timeStore';
import { PomodoroView } from './PomodoroView';
import { usePomodoro } from './usePomodoro';

const MIN = 60_000;
const NOW = atLocalTime('2026-11-05', '15:00');

function Pomodoro() {
  return <PomodoroView pomodoro={usePomodoro()} />;
}

const event = (over: Partial<LifeEvent>) =>
  newRecord({
    title: 'IELTS',
    type: 'exam' as const,
    date: '2026-11-05',
    importance: 3 as const,
    prepDays: 7,
    ...over,
  });

async function focusSession(startHHmm: string, minutes = 25) {
  const [study] = await listCategories();
  const start = atLocalTime('2026-11-05', startHHmm);
  await db.timeEntries.add(
    newRecord({
      categoryId: study!.id,
      start,
      end: start + minutes * MIN,
      date: '2026-11-05',
      source: 'pomodoro' as const,
    }),
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  await Promise.all([
    db.timeCategories.clear(),
    db.timeEntries.clear(),
    db.tasks.clear(),
    db.lifeEvents.clear(),
    db.settings.clear(),
    db.sleepLogs.clear(),
    db.checkIns.clear(),
  ]);
  await createDefaultCategories(NOW - 10_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Pomodoro: норма фокус-сессий из адаптации', () => {
  it('focusPomodoros = 7 и сегодня 3 фокус-сессии: при открытии Pomodoro видно «3 из 7» и Progress', async () => {
    await db.settings.put({ key: BASELINE_SETTING_KEY, value: { ...DEFAULT_BASELINE, focusPomodoros: 7 } });
    await focusSession('09:00');
    await focusSession('10:00');
    await focusSession('11:00');
    await focusSession('12:00', 5); // stopped early — not a full session
    // a longer focus setting does not rewrite sessions already done
    localStorage.setItem('lifeos.time.pomodoro.settings', JSON.stringify({ workMin: 60 }));
    render(<Pomodoro />);

    expect(await screen.findByText('3 из 7')).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Фокус-сессии сегодня' });
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(progress).toHaveAttribute('aria-valuemax', '7');
  });

  it('focusProjectId задан: при выборе задачи для сессии задачи этого проекта стоят первыми', async () => {
    // prep phase: the exam is in 3 days and is about the «english» project
    await db.lifeEvents.add(event({ date: '2026-11-08', projectId: 'english' }));
    await db.tasks.bulkAdd([
      newRecord({ title: 'Отчёт', priority: 1 as const, tags: [] }),
      newRecord({ title: 'Writing task 2', priority: 3 as const, tags: [], projectId: 'english' }),
      newRecord({ title: 'Speaking', priority: 2 as const, tags: [], projectId: 'english' }),
    ]);
    render(<Pomodoro />);

    const select = await screen.findByLabelText('Задача');
    const group = await within(select).findByRole('group', { name: 'Фокус-проект дня' });
    expect(
      within(group)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Speaking', 'Writing task 2']);
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Без задачи', 'Speaking', 'Writing task 2', 'Отчёт']);
  });

  it('все открытые задачи из фокус-проекта: пустой группы «Остальные задачи» нет', async () => {
    await db.lifeEvents.add(event({ date: '2026-11-08', projectId: 'english' }));
    await db.tasks.add(newRecord({ title: 'Speaking', priority: 2 as const, tags: [], projectId: 'english' }));
    render(<Pomodoro />);
    const select = await screen.findByLabelText('Задача');
    await within(select).findByRole('group', { name: 'Фокус-проект дня' });
    expect(within(select).queryByRole('group', { name: 'Остальные задачи' })).not.toBeInTheDocument();
  });

  it('focusPomodoros = 0 (день события): при открытии показано «Сегодня без фокус-сессий» и причина из reasons', async () => {
    await db.lifeEvents.add(event({ date: '2026-11-05' }));
    render(<Pomodoro />);

    expect(await screen.findByText('Сегодня без фокус-сессий')).toBeInTheDocument();
    expect(screen.getByText('Сегодня «IELTS»: только самое важное, без тренировки')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
