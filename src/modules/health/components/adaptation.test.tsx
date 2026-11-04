import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASELINE_SETTING_KEY } from '../../../core/adaptation/rules';
import { db } from '../../../core/db';
import { logSleep } from '../data/sleep';
import { SleepTab } from './SleepTab';
import { WorkoutsTab } from './WorkoutsTab';

const TODAY = '2026-11-04';

/** The user's normal day — written here only as test setup (the `today` module owns this setting). */
async function setBaseline(value: Record<string, unknown>) {
  await db.settings.put({ key: BASELINE_SETTING_KEY, value });
}

function renderIn(ui: React.ReactNode) {
  render(<MemoryRouter>{ui}</MemoryRouter>);
}

beforeEach(async () => {
  await Promise.all([db.sleepLogs.clear(), db.settings.clear(), db.workoutLogs.clear(), db.lifeEvents.clear()]);
});

describe('health adaptation', () => {
  it('Given goals of 8 h sleep and bedtime 23:00 and 6.5 h slept last night When I open «Сон» Then I see the goal and the difference «−1,5 ч»', async () => {
    await setBaseline({ sleepHours: 8, bedtime: '23:00' });
    await logSleep({ wakeDay: TODAY, bedtime: '00:30', wake: '07:00', quality: 3 }, TODAY);
    renderIn(<SleepTab today={TODAY} />);

    const goal = await screen.findByText('Цель сна');
    const card = goal.parentElement!;
    expect(card).toHaveTextContent('8 ч, отбой в 23:00');
    expect(card).toHaveTextContent('Прошлая ночь: 6,5 ч (−1,5 ч)');
  });

  it('without a record for last night only the goal is shown', async () => {
    renderIn(<SleepTab today={TODAY} />);
    const card = (await screen.findByText('Цель сна')).parentElement!;
    expect(card).toHaveTextContent('7,5 ч, отбой в 23:30');
    expect(card).not.toHaveTextContent('Прошлая ночь');
  });

  it('Given maxWorkoutIntensity = light When I choose RPE 7 Then a soft warning shows the reason from `reasons`', async () => {
    // 5 h of sleep → the short-sleep rule caps today's workout at «light» and explains why.
    await logSleep({ wakeDay: TODAY, bedtime: '02:00', wake: '07:00', quality: 2 }, TODAY);
    renderIn(<WorkoutsTab today={TODAY} />);
    await screen.findByText(/тренировок нет/);

    fireEvent.change(screen.getByLabelText('RPE (1–10)'), { target: { value: '4' } });
    expect(screen.queryByRole('note', { name: 'Предупреждение об интенсивности' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('RPE (1–10)'), { target: { value: '7' } });
    const warning = await screen.findByRole('note', { name: 'Предупреждение об интенсивности' });
    expect(warning).toHaveTextContent('лёгкая интенсивность — RPE до 4');
    expect(warning).toHaveTextContent('Сон прошлой ночью 5.0 ч: нагрузка −20%, тренировка не выше лёгкой');

    // Soft: saving still works.
    fireEvent.change(screen.getByLabelText('Длительность, мин'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить тренировку' }));
    expect(await screen.findByText('Тренировка сохранена')).toBeInTheDocument();
    expect(await db.workoutLogs.count()).toBe(1);
  });

  it('rest day: any RPE gets a «rest» warning', async () => {
    await setBaseline({ maxWorkoutIntensity: 'rest' });
    renderIn(<WorkoutsTab today={TODAY} />);
    await screen.findByText(/тренировок нет/);
    fireEvent.change(screen.getByLabelText('RPE (1–10)'), { target: { value: '1' } });
    const warning = await screen.findByRole('note', { name: 'Предупреждение об интенсивности' });
    expect(warning).toHaveTextContent('Сегодня рекомендован отдых без тренировки');
    expect(warning).toHaveTextContent('Так задано в вашем обычном режиме');
  });
});
