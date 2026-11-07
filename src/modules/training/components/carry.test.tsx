import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { saveWorkout } from '../../../core/logging/workout';
import { createProgram, skipMissedSessions } from '../data/programs';
import { ProgramsSection } from './ProgramsSection';

// Program started on Monday 2 Nov 2026; Monday was missed. Today: Wednesday 4 Nov.
const START = '2026-11-02';
const TODAY = '2026-11-04';

beforeEach(async () => {
  await Promise.all([db.programs.clear(), db.plannedSessions.clear(), db.workoutLogs.clear()]);
  await createProgram(
    {
      name: 'Сила',
      weeks: 2,
      days: [
        { weekday: 1, exercises: [{ name: 'Тяга в наклоне', sets: 3, reps: 10 }] },
        { weekday: 3, exercises: [{ name: 'Жим лёжа', sets: 3, reps: 8 }] },
      ],
    },
    START,
    1_000,
  );
  await skipMissedSessions(TODAY, 1_000);
});

describe('adaptive plan on the training screen (#226)', () => {
  it('Given пропущена сессия When открываю следующую сессию той же программы Then в ней перенесённое упражнение с объёмом −30 % и пометкой «перенесено с <дата>»', async () => {
    render(<ProgramsSection today={TODAY} />);
    // The runner restarts with the longer list once the carry-over is written.
    await screen.findByText(/перенесено с 2 ноября/);
    expect(screen.getByRole('list', { name: 'Сессия на сегодня' })).toHaveTextContent('Тяга в наклоне: 2 × 10');
  });

  it('Given перенесённое упражнение When я убираю его Then оно исчезает и автоперенос его больше не возвращает', async () => {
    render(<ProgramsSection today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Убрать перенесённое: Тяга в наклоне' }));
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Сессия на сегодня' })).not.toHaveTextContent('Тяга в наклоне'),
    );
    // A new day's run (re-render) does not bring it back.
    await new Promise((r) => setTimeout(r, 50));
    const today = await db.plannedSessions.where('date').equals(TODAY).first();
    expect(today?.exercises.map((e) => e.name)).toEqual(['Жим лёжа']);
  });

  it('Given экран программы When открываю «Баланс групп мышц» Then вижу за текущую и прошлую неделю план и факт по каждой группе, недотренированные выделены', async () => {
    await saveWorkout({
      date: '2026-11-03',
      type: 'Силовая',
      durationMin: 30,
      rpe: 6,
      exercises: [{ name: 'Жим лёжа', sets: [{ reps: 8 }] }],
    });
    render(<ProgramsSection today={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Баланс групп мышц' }));
    const dialog = await screen.findByRole('dialog', { name: 'Баланс групп мышц' });
    const current = await within(dialog).findByRole('region', { name: 'Эта неделя' });
    // Back: 3 sets planned on Monday (missed), none done → under-trained. Chest: 3 planned today, 1 done.
    expect(await within(current).findByLabelText('Спина: план 3, факт 0, недобор')).toBeInTheDocument();
    expect(within(current).getByLabelText('Грудь: план 3, факт 1, недобор')).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: 'Прошлая неделя' })).toHaveTextContent('Нет плана и тренировок');
  });
});
