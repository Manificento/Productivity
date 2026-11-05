import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { addMealItem, createFood } from '../data/food';
import { saveGoal, saveProfile } from '../data/goal';
import { logWeight } from '../data/weight';
import { GoalCard } from './GoalCard';

const TODAY = '2026-11-04';
const profile = { heightCm: 180, birthYear: 1996, sex: 'male' as const };

beforeEach(async () => {
  await Promise.all([
    db.settings.clear(),
    db.weightLogs.clear(),
    db.mealLogs.clear(),
    db.foods.clear(),
    db.lifeEvents.clear(),
  ]);
});

describe('goal card', () => {
  it('Given нет цели When я открываю «Цель» Then выбор «снизить / удержать / набрать» и темп; сохраняется в settings nutrition.goal', async () => {
    render(<GoalCard today={TODAY} />);
    const group = await screen.findByRole('radiogroup', { name: 'Цель по весу' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Снизить', 'Удержать', 'Набрать']);
    fireEvent.click(within(group).getByRole('radio', { name: 'Набрать' }));
    fireEvent.change(screen.getByLabelText('Темп'), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить цель' }));
    expect(await screen.findByText('Цель сохранена')).toBeInTheDocument();
    expect((await db.settings.get('nutrition.goal'))?.value).toEqual({ kind: 'gain', ratePct: 0.25 });
  });

  it('Given данных меньше порога When я открываю цели Then стартовая оценка по Mifflin–St Jeor с пометкой «уточним через N дней»', async () => {
    await saveGoal({ kind: 'maintain', ratePct: 0 });
    await saveProfile(profile);
    await logWeight(TODAY, 80);
    render(<GoalCard today={TODAY} />);
    expect(await screen.findByText(/уточним через 13 дней/)).toBeInTheDocument();
    expect(screen.getByText('2490 ккал')).toBeInTheDocument();
  });

  it('Given профиль не задан When ввожу рост и год Then сохраняется в settings nutrition.profile и появляется оценка', async () => {
    await saveGoal({ kind: 'maintain', ratePct: 0 });
    await logWeight(TODAY, 80);
    render(<GoalCard today={TODAY} />);
    fireEvent.change(await screen.findByLabelText('Рост, см'), { target: { value: '180' } });
    fireEvent.change(screen.getByLabelText('Год рождения'), { target: { value: '1996' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить данные' }));
    expect(await screen.findByText(/уточним через/)).toBeInTheDocument();
    expect((await db.settings.get('nutrition.profile'))?.value).toEqual(profile);
  });

  it('Given цель «удержать» When выбираю «Снизить» и сохраняю Then ratePct = показанному темпу, а не 0', async () => {
    await saveGoal({ kind: 'maintain', ratePct: 0 });
    render(<GoalCard today={TODAY} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Снизить' }));
    const shown = Number((screen.getByLabelText('Темп') as HTMLSelectElement).value);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить цель' }));
    await screen.findByText('Цель сохранена');
    expect((await db.settings.get('nutrition.goal'))?.value).toEqual({ kind: 'lose', ratePct: shown });
    expect(shown).toBeGreaterThan(0);
  });

  it('Given сначала профиль, потом вес When логирую вес Then цели появляются без перезахода', async () => {
    await saveGoal({ kind: 'maintain', ratePct: 0 });
    await saveProfile(profile);
    render(<GoalCard today={TODAY} />);
    await screen.findByText(/Цели по калориям появятся/);
    await logWeight(TODAY, 80);
    const targets = await screen.findByRole('group', { name: 'Цели дня по питанию' });
    expect(targets).toHaveTextContent('2490 ккал');
  });

  it('Given стартовая оценка When меняю рост Then цели и nutrition.expenditure обновляются сразу', async () => {
    await saveGoal({ kind: 'maintain', ratePct: 0 });
    await saveProfile(profile);
    await logWeight(TODAY, 80);
    render(<GoalCard today={TODAY} />);
    const targets = await screen.findByRole('group', { name: 'Цели дня по питанию' });
    await waitFor(() => expect(targets).toHaveTextContent('2490 ккал'));
    fireEvent.change(screen.getByLabelText('Рост, см'), { target: { value: '170' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить данные' }));
    await waitFor(() => expect(targets).toHaveTextContent('2400 ккал'));
  });

  it('Given рост 20 When сохраняю данные Then ошибка валидации', async () => {
    render(<GoalCard today={TODAY} />);
    fireEvent.change(await screen.findByLabelText('Рост, см'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Год рождения'), { target: { value: '1996' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить данные' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Рост');
    expect(await db.settings.get('nutrition.profile')).toBeUndefined();
  });

  it('Given расход и цель заданы When показываются цели дня Then kcal и БЖУ берутся из useDailyTargets', async () => {
    await saveGoal({ kind: 'lose', ratePct: 0.5 });
    await saveProfile(profile);
    await logWeight(TODAY, 80);
    render(<GoalCard today={TODAY} />);
    // 2490 − 80·0,5 %·7700/7 = 2490 − 440 = 2050; Б 144 · Ж 64
    const targets = await screen.findByRole('group', { name: 'Цели дня по питанию' });
    await waitFor(() => expect(targets).toHaveTextContent('2050 ккал'));
    expect(targets).toHaveTextContent('Б 144 · Ж 64');
  });

  it('Given ≥ 14 дней веса и ≥ 10 дней дневника When открываю цели Then оценка измерена и пометки «уточним» нет', async () => {
    await saveGoal({ kind: 'maintain', ratePct: 0 });
    const food = await createFood({ name: 'Рис', kcal: 100, protein: 0, fat: 0, carbs: 0 });
    for (let i = 0; i < 14; i++) {
      const date = shiftDateKey(TODAY, -i);
      await logWeight(date, 80);
      await addMealItem(date, 'lunch', { foodId: food.id, grams: 2500 });
    }
    render(<GoalCard today={TODAY} />);
    const targets = await screen.findByRole('group', { name: 'Цели дня по питанию' });
    await waitFor(() => expect(targets).toHaveTextContent('2500 ккал'));
    expect(screen.queryByText(/уточним через/)).not.toBeInTheDocument();
    expect((await db.settings.get('nutrition.expenditure'))?.value).toMatchObject({ kcal: 2500, source: 'measured' });
  });

  it('Given фаза taper When я смотрю цель Then калории без дефицита и причина из reasons', async () => {
    await saveGoal({ kind: 'lose', ratePct: 0.5 });
    await saveProfile(profile);
    await logWeight(TODAY, 80);
    await db.lifeEvents.add(
      newRecord({
        title: 'Экзамен',
        type: 'exam' as const,
        date: shiftDateKey(TODAY, 1),
        importance: 3 as const,
        prepDays: 7,
      }),
    );
    render(<GoalCard today={TODAY} />);
    const targets = await screen.findByRole('group', { name: 'Цели дня по питанию' });
    await waitFor(() => expect(targets).toHaveTextContent('2490 ккал'));
    expect(within(targets).getByRole('list', { name: 'Почему такие цели' })).toHaveTextContent('без дефицита калорий');
  });
});
