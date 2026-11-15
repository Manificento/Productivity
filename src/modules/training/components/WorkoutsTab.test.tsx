import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { saveWorkout } from '../../../core/logging/workout';
import { WorkoutsTab } from './WorkoutsTab';

// Keep the real implementation, but record calls: the form must write through the shared core path.
vi.mock('../../../core/logging/workout', { spy: true });

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
  vi.mocked(saveWorkout).mockClear();
  await db.workoutLogs.clear();
});

describe('workouts tab', () => {
  it('Given the workout form When I choose type, duration, RPE 1–10 and save Then the workout is saved through saveWorkout() from core and appears in the history', async () => {
    renderTab();
    expect(await screen.findByText(/За последние 60 дней тренировок нет/)).toBeInTheDocument();
    type('Тип', 'Бег');
    type('Длительность, мин', '45');
    type('RPE (1–10)', '6');
    save();

    const item = within(await history()).getByRole('listitem', { name: /Бег, 4 ноября/ });
    expect(saveWorkout).toHaveBeenCalledTimes(1);
    expect(saveWorkout).toHaveBeenCalledWith({ date: TODAY, type: 'Бег', durationMin: 45, rpe: 6 });
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

  it('Given a workout in the history When I delete it (with confirmation) Then it disappears from the history and the week totals', async () => {
    await saveWorkout({ date: TODAY, type: 'Бег', durationMin: 30, rpe: 6 }, 1);
    await saveWorkout({ date: '2026-11-03', type: 'Йога', durationMin: 20, rpe: 2 }, 2);
    renderTab();
    const list = await history();
    expect(stat('Минуты')).toHaveTextContent('50');

    fireEvent.click(within(list).getByRole('button', { name: 'Удалить: Бег, 4 ноября' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить тренировку?' });
    expect(dialog).toHaveTextContent('«Бег, 4 ноября» будет удалена');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(within(list).getByRole('listitem', { name: 'Бег, 4 ноября' })).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: 'Удалить: Бег, 4 ноября' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(within(list).queryByRole('listitem', { name: 'Бег, 4 ноября' })).not.toBeInTheDocument(),
    );
    expect(within(list).getByRole('listitem', { name: 'Йога, 3 ноября' })).toBeInTheDocument();
    expect(stat('Минуты')).toHaveTextContent('20');
    expect(stat('Тренировки')).toHaveTextContent('1');
    expect(stat('Средний RPE')).toHaveTextContent('2');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a failed deletion shows an error and keeps the workout', async () => {
    await saveWorkout({ date: TODAY, type: 'Бег', durationMin: 30, rpe: 6 }, 1);
    renderTab();
    fireEvent.click(within(await history()).getByRole('button', { name: 'Удалить: Бег, 4 ноября' }));
    // deleteWorkout() marks the record through softDelete() (contract #274), which writes with bulkUpdate.
    const del = vi.spyOn(db.workoutLogs, 'bulkUpdate').mockRejectedValueOnce(new Error('quota'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Не удалось удалить');
    expect(await db.workoutLogs.count()).toBe(1);
    del.mockRestore();
  });

  it('Given записанная тренировка When я открываю её в истории Then видны подходы и RPE', async () => {
    await saveWorkout({
      date: TODAY,
      type: 'Силовая',
      durationMin: 45,
      rpe: 7,
      exercises: [
        {
          name: 'Румынская тяга',
          sets: [
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
          ],
        },
      ],
    });
    renderTab();
    const item = within(await history()).getByRole('listitem', { name: /Силовая, 4 ноября/ });
    expect(item).toHaveTextContent('45 мин · RPE 7');
    expect(item).toHaveTextContent('Румынская тяга: 8 × 60 кг, 8 × 60 кг');
  });

  it('sets without reps and weight read «N подх.», not «0 кг»', async () => {
    await saveWorkout({
      date: TODAY,
      type: 'Силовая',
      durationMin: 10,
      rpe: 5,
      exercises: [{ name: 'Планка', sets: [{}, {}, {}] }],
    });
    renderTab();
    const item = within(await history()).getByRole('listitem', { name: /Силовая, 4 ноября/ });
    expect(item).toHaveTextContent('Планка: 3 подх.');
    expect(item).not.toHaveTextContent('0 кг');
  });
});

describe('workouts tab across midnight', () => {
  const renderAt = (today: string) => {
    const ui = (d: string) => (
      <MemoryRouter>
        <WorkoutsTab today={d} />
      </MemoryRouter>
    );
    const view = render(ui(today));
    return (d: string) => view.rerender(ui(d));
  };

  it('Given страница «Тренировки» открыта через полночь и форма не тронута When наступает новый день Then дата в форме новой тренировки — новый день', async () => {
    const setDay = renderAt(TODAY);
    expect(await screen.findByLabelText('Дата')).toHaveValue(TODAY);
    setDay('2026-11-05');
    await waitFor(() => expect(screen.getByLabelText('Дата')).toHaveValue('2026-11-05'));
    expect(screen.getByLabelText('Дата')).toHaveAttribute('max', '2026-11-05');
  });

  it('Given в форме уже введены данные When наступает новый день Then введённое не теряется', async () => {
    const setDay = renderAt(TODAY);
    await screen.findByLabelText('Дата');
    type('Тип', 'Бег');
    type('Длительность, мин', '45');
    setDay('2026-11-05');
    await waitFor(() => expect(screen.getByLabelText('Дата')).toHaveAttribute('max', '2026-11-05'));
    expect(screen.getByLabelText('Тип')).toHaveValue('Бег');
    expect(screen.getByLabelText('Длительность, мин')).toHaveValue('45');
    expect(screen.getByLabelText('Дата')).toHaveValue(TODAY); // a workout started before midnight stays on its day
  });
});
