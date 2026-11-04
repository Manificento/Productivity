import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASELINE_SETTING_KEY } from '../../../core/adaptation/rules';
import { db } from '../../../core/db';
import { logSleep } from '../data/sleep';
import { SleepTab } from './SleepTab';
import { WorkoutsTab } from './WorkoutsTab';

const TODAY = '2026-11-04';

/**
 * The goal card shows up as soon as tonight's targets load; sleep records and yesterday's targets
 * arrive in later live-query ticks. So wait for the final text, not for the card itself.
 */
async function goalCardWithText(...texts: string[]) {
  const card = await screen.findByRole('region', { name: 'Цель сна' });
  await waitFor(() => texts.forEach((t) => expect(card).toHaveTextContent(t)));
  return card;
}

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

    await goalCardWithText('Сегодня: 8 ч, отбой в 23:00', 'Прошлая ночь: 6,5 ч (−1,5 ч)');
  });

  it('without a record for last night only the goal is shown', async () => {
    renderIn(<SleepTab today={TODAY} />);
    const card = await goalCardWithText('Сегодня: 7,5 ч, отбой в 23:30');
    // Sleep records have loaded (empty chart) — only then is «no last night» meaningful.
    await screen.findByText(/Записей пока нет/);
    expect(card).not.toHaveTextContent('Прошлая ночь');
  });

  it('last night is measured against yesterday’s goal, tonight’s goal is the headline (exam tomorrow)', async () => {
    // Exam on 2026-11-05: yesterday prep (8 h), today taper (8,5 h, bedtime 30 min earlier).
    await db.lifeEvents.put({
      id: 'exam',
      createdAt: 0,
      updatedAt: 0,
      title: 'Экзамен',
      type: 'exam',
      date: '2026-11-05',
      importance: 3,
      prepDays: 7,
    });
    await logSleep({ wakeDay: TODAY, bedtime: '23:30', wake: '07:00', quality: 3 }, TODAY); // 7,5 h
    renderIn(<SleepTab today={TODAY} />);
    await goalCardWithText('Сегодня: 8,5 ч, отбой в 23:00', 'Прошлая ночь: 7,5 ч (−0,5 ч) при цели 8 ч');
  });

  it('a workout logged for a past day gets no warning', async () => {
    await setBaseline({ maxWorkoutIntensity: 'rest' });
    renderIn(<WorkoutsTab today={TODAY} />);
    await screen.findByText(/тренировок нет/);
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-11-03' } });
    fireEvent.change(screen.getByLabelText('RPE (1–10)'), { target: { value: '9' } });
    expect(screen.queryByRole('note', { name: 'Предупреждение об интенсивности' })).not.toBeInTheDocument();
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
