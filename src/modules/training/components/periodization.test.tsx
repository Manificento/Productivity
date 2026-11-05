import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASELINE_SETTING_KEY } from '../../../core/adaptation/rules';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import type { ProgramExercise } from '../../../core/types';
import { createProgram } from '../data/programs';
import { ProgramsSection } from './ProgramsSection';

const TODAY = '2026-11-04'; // Wednesday

const strength: ProgramExercise[] = [
  { name: 'Присед', sets: 5, reps: 5, weightKg: 100, rpeTarget: 8 },
  { name: 'Жим', sets: 3, reps: 8, weightKg: 60, rpeTarget: 6 },
];

beforeEach(async () => {
  await Promise.all([
    db.programs.clear(),
    db.plannedSessions.clear(),
    db.workoutLogs.clear(),
    db.lifeEvents.clear(),
    db.settings.clear(),
  ]);
  await createProgram(
    { name: 'Сила', weeks: 4, days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, exercises: strength })) },
    TODAY,
    1,
  );
});

const addEvent = (date: string, title = 'Экзамен') =>
  db.lifeEvents.add(newRecord({ title, type: 'exam' as const, date, importance: 3 as const, prepDays: 7 }, 1));

describe('session periodization', () => {
  it('Given deload = true When я открываю сессию Then веса и объём −40% с пометкой из reasons', async () => {
    await addEvent('2026-11-05'); // tomorrow → taper → deload
    render(<ProgramsSection today={TODAY} />);
    const list = await screen.findByRole('list', { name: 'Сессия на сегодня' });
    expect(within(list).getByText(/Присед: 3 × 5, 60 кг/)).toBeInTheDocument();
    expect(within(list).getByText(/Жим: 2 × 8, 36 кг/)).toBeInTheDocument();
    const note = screen.getByRole('note', { name: 'Разгрузка' });
    expect(note).toHaveTextContent('Разгрузка: вес и объём −40%');
    expect(note).toHaveTextContent('Завтра «Экзамен»: разгрузочный день');
  });

  it('Given maxWorkoutIntensity = rest When я открываю сессию Then предложение перенести и «Всё равно выполнить»', async () => {
    await addEvent(TODAY); // the event day → rest
    render(<ProgramsSection today={TODAY} />);
    expect(await screen.findByRole('note', { name: 'Совет: день отдыха' })).toHaveTextContent('перенесите тренировку');
    expect(screen.queryByRole('list', { name: 'Сессия на сегодня' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Всё равно выполнить' }));
    expect(await screen.findByRole('list', { name: 'Сессия на сегодня' })).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'Совет: день отдыха' })).not.toBeInTheDocument();
  });

  it('Given maxWorkoutIntensity = light When показывается сессия Then упражнения с RPE ≥ 7 помечены «сегодня легче»', async () => {
    await db.settings.put({ key: BASELINE_SETTING_KEY, value: { maxWorkoutIntensity: 'light' } });
    render(<ProgramsSection today={TODAY} />);
    const list = await screen.findByRole('list', { name: 'Сессия на сегодня' });
    const [squat, press] = within(list).getAllByRole('listitem');
    expect(squat).toHaveTextContent('сегодня легче');
    expect(press).not.toHaveTextContent('сегодня легче');
  });

  it('a normal day has no notes', async () => {
    render(<ProgramsSection today={TODAY} />);
    expect(await screen.findByRole('list', { name: 'Сессия на сегодня' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('plan outlook', () => {
  it('Given событие через 10 дней When я смотрю план на 2 недели Then разгрузочный день и день отдыха отмечены заранее', async () => {
    await addEvent('2026-11-14'); // today + 10
    render(<ProgramsSection today={TODAY} />);
    const plan = await screen.findByRole('list', { name: 'План на 2 недели' });
    // Each day loads its own targets, so the marks appear a moment after the list.
    await waitFor(() => {
      expect(within(plan).getByRole('listitem', { name: /13 ноября/ })).toHaveTextContent('Разгрузка');
      expect(within(plan).getByRole('listitem', { name: /14 ноября/ })).toHaveTextContent('День отдыха');
    });
    expect(within(plan).getByRole('listitem', { name: /10 ноября/ })).not.toHaveTextContent(/Разгрузка|День отдыха/);
  });
});
