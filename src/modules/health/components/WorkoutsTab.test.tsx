import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { saveWorkout } from '../data/workouts';
import { WorkoutsTab } from './WorkoutsTab';

const TODAY = '2026-11-04'; // Wednesday

function renderTab() {
  render(
    <MemoryRouter>
      <WorkoutsTab today={TODAY} />
    </MemoryRouter>,
  );
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить тренировку' }));
const history = () => screen.findByRole('list', { name: 'История тренировок' });
const stat = (label: string) => screen.getByText(label).nextElementSibling;

beforeEach(async () => {
  await db.workoutLogs.clear();
});

describe('workouts tab', () => {
  it('Given the workout form When I choose type, duration, RPE 1–10 and save Then the workout appears in the history', async () => {
    renderTab();
    expect(await screen.findByText(/За последние 60 дней тренировок нет/)).toBeInTheDocument();
    type('Тип', 'Бег');
    type('Длительность, мин', '45');
    type('RPE (1–10)', '6');
    save();

    const item = within(await history()).getByRole('listitem', { name: /Бег, 4 ноября/ });
    expect(item).toHaveTextContent('45 мин · RPE 6');
    expect(await screen.findByRole('status')).toHaveTextContent('Тренировка сохранена');
    expect(screen.getByLabelText('Длительность, мин')).toHaveValue('');
  });

  it('an invalid form shows an error and saves nothing', async () => {
    renderTab();
    type('Длительность, мин', '45');
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('RPE — от 1 до 10');
    expect(await db.workoutLogs.count()).toBe(0);
  });

  it('Given I add exercises with sets When I save Then they are shown in the workout card', async () => {
    renderTab();
    type('Тип', 'Силовая');
    type('Длительность, мин', '60');
    type('RPE (1–10)', '8');
    fireEvent.click(screen.getByRole('button', { name: '+ Упражнение' }));
    type('Упражнение 1: название', 'Жим лёжа');
    type('Упражнение 1, подход 1: повторы', '10');
    type('Упражнение 1, подход 1: вес, кг', '60');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить подход в упражнение 1' }));
    type('Упражнение 1, подход 2: повторы', '8');
    type('Упражнение 1, подход 2: вес, кг', '62,5');
    save();

    const item = within(await history()).getByRole('listitem', { name: /Силовая/ });
    expect(item).toHaveTextContent('Жим лёжа: 10 × 60 кг, 8 × 62,5 кг');
  });

  it('removing an exercise drops it from the form', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: '+ Упражнение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить упражнение 1' }));
    expect(screen.queryByLabelText('Упражнение 1: название')).not.toBeInTheDocument();
  });

  it('Given a past workout When I press «Повторить» Then the form is filled with its data and today’s date', async () => {
    await saveWorkout({
      date: '2026-10-30',
      type: 'Силовая',
      durationMin: 50,
      rpe: 7,
      exercises: [{ name: 'Тяга', sets: [{ reps: 5, weightKg: 100 }] }],
    });
    renderTab();
    fireEvent.click(within(await history()).getByRole('button', { name: 'Повторить: Силовая, 30 октября' }));

    expect(screen.getByLabelText('Дата')).toHaveValue(TODAY);
    expect(screen.getByLabelText('Тип')).toHaveValue('Силовая');
    expect(screen.getByLabelText('Длительность, мин')).toHaveValue('50');
    expect(screen.getByLabelText('RPE (1–10)')).toHaveValue('7');
    expect(screen.getByLabelText('Упражнение 1: название')).toHaveValue('Тяга');
    expect(screen.getByLabelText('Упражнение 1, подход 1: вес, кг')).toHaveValue('100');

    save();
    expect(await screen.findByRole('listitem', { name: /Силовая, 4 ноября/ })).toBeInTheDocument();
    expect(await db.workoutLogs.count()).toBe(2);
  });

  it('Given workouts this week When the screen opens Then minutes, number of workouts and average RPE for the week are shown', async () => {
    await saveWorkout({ date: '2026-11-02', type: 'Бег', durationMin: 30, rpe: 5 });
    await saveWorkout({ date: TODAY, type: 'Силовая', durationMin: 60, rpe: 8 });
    await saveWorkout({ date: '2026-11-01', type: 'Бег', durationMin: 90, rpe: 9 }); // previous week
    renderTab();
    await history();
    expect(stat('Минуты')).toHaveTextContent('90');
    expect(stat('Тренировки')).toHaveTextContent('2');
    expect(stat('Средний RPE')).toHaveTextContent('6,5');
  });

  it('a failed save shows an error', async () => {
    const add = vi.spyOn(db.workoutLogs, 'add').mockRejectedValueOnce(new Error('quota'));
    renderTab();
    type('Длительность, мин', '30');
    type('RPE (1–10)', '5');
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить тренировку');
    add.mockRestore();
  });

  it('editing the form after a save hides the «Тренировка сохранена» message', async () => {
    renderTab();
    type('Длительность, мин', '30');
    type('RPE (1–10)', '5');
    save();
    await screen.findByText('Тренировка сохранена');
    type('Длительность, мин', '40');
    expect(screen.queryByText('Тренировка сохранена')).not.toBeInTheDocument();
  });

  it('an empty week shows zeros and no average', async () => {
    renderTab();
    await screen.findByText(/тренировок нет/);
    expect(stat('Минуты')).toHaveTextContent('0');
    expect(stat('Средний RPE')).toHaveTextContent('—');
  });
});
