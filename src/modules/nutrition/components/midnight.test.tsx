import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { addMealItem, createFood } from '../data/food';
import { saveGoal, saveProfile } from '../data/goal';
import { logWeight } from '../data/weight';
import { FoodTab } from './FoodTab';
import { GoalCard } from './GoalCard';
import { WeightCard } from './WeightCard';

// No `today` prop: the components follow the clock themselves (useTodayKey).
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ products: [] }) }));
  await Promise.all([
    db.settings.clear(),
    db.weightLogs.clear(),
    db.mealLogs.clear(),
    db.foods.clear(),
    db.lifeEvents.clear(),
  ]);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 23, 59));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const passMidnight = () => {
  vi.setSystemTime(new Date(2026, 10, 5, 0, 0, 5));
  act(() => {
    fireEvent.focus(window);
  });
};

describe('midnight on the nutrition screen', () => {
  it('Given экран питания открыт через полночь When наступает новый день Then FoodTab показывает еду нового дня без перезагрузки', async () => {
    const rice = await createFood({ name: 'Рис', kcal: 100, protein: 0, fat: 0, carbs: 0 });
    const tea = await createFood({ name: 'Чай', kcal: 1, protein: 0, fat: 0, carbs: 0 });
    await addMealItem('2026-11-04', 'lunch', { foodId: rice.id, grams: 100 });
    await addMealItem('2026-11-05', 'lunch', { foodId: tea.id, grams: 200 });
    render(
      <MemoryRouter>
        <FoodTab nowTime="10:00" />
      </MemoryRouter>,
    );
    const lunch = await screen.findByRole('region', { name: 'Обед' });
    expect(await within(lunch).findByText('Рис, 100 г')).toBeInTheDocument();
    passMidnight();
    expect(await within(lunch).findByText('Чай, 200 г')).toBeInTheDocument();
    expect(within(lunch).queryByText('Рис, 100 г')).not.toBeInTheDocument();
  });

  it('Given экран питания открыт через полночь When наступает новый день Then GoalCard показывает цели нового дня без перезагрузки', async () => {
    await saveGoal({ kind: 'lose', ratePct: 0.5 });
    await saveProfile({ heightCm: 180, birthYear: 1996, sex: 'male' });
    await logWeight('2026-11-04', 80);
    await db.lifeEvents.add(
      newRecord({ title: 'Экзамен', type: 'exam' as const, date: '2026-11-06', importance: 3 as const, prepDays: 7 }),
    );
    render(<GoalCard />);
    const targets = await screen.findByRole('group', { name: 'Цели дня по питанию' });
    await waitFor(() => expect(targets).toHaveTextContent('2050 ккал'));
    passMidnight(); // the day before the exam: no deficit
    await waitFor(() => expect(targets).toHaveTextContent('2490 ккал'));
  });

  it('Given экран питания открыт через полночь When наступает новый день Then WeightCard сдвигает окно графика на новый день без перезагрузки', async () => {
    await logWeight('2026-08-07', 80); // today − 89: the oldest day of the 90-day window
    await logWeight('2026-11-04', 80);
    render(<WeightCard />);
    expect(await screen.findAllByTestId('weight-point')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Вся история' })).not.toBeInTheDocument();
    passMidnight();
    await waitFor(() => expect(screen.getAllByTestId('weight-point')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Вся история' })).toBeInTheDocument();
  });
});
