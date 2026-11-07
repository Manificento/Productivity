import { beforeEach, describe, expect, it } from 'vitest';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { addMealItem, createFood } from './food';
import { refreshExpenditure, saveGoal, saveProfile } from './goal';
import { logWeight } from './weight';

const TODAY = '2026-11-04';
const NOW = Date.UTC(2026, 10, 4, 12);
const profile = { heightCm: 180, birthYear: 1996, sex: 'male' as const };

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.weightLogs.clear(), db.mealLogs.clear(), db.foods.clear()]);
});

const stored = async () => (await db.settings.get('nutrition.expenditure'))?.value;

describe('goal and expenditure settings', () => {
  it('Given я выбираю цель When сохраняю Then она лежит в settings nutrition.goal', async () => {
    await saveGoal({ kind: 'lose', ratePct: 0.5 });
    expect((await db.settings.get('nutrition.goal'))?.value).toEqual({ kind: 'lose', ratePct: 0.5 });
  });

  it('Given данных меньше порога и профиль When пересчитываю Then в nutrition.expenditure стартовая оценка', async () => {
    await saveProfile(profile);
    await logWeight(TODAY, 80);
    const e = await refreshExpenditure(TODAY, NOW);
    expect(e).toMatchObject({ kind: 'starter', kcal: 2490 });
    expect(await stored()).toEqual({ kcal: 2490, updatedAt: NOW, source: 'starter' });
  });

  it('Given ≥ 14 дней веса и ≥ 14 дней дневника (половина окна) When пересчитываю Then измеренный расход сохраняется, и раз в неделю обновляется', async () => {
    await saveProfile(profile);
    const food = await createFood({ name: 'Рис', kcal: 100, protein: 0, fat: 0, carbs: 0 });
    for (let i = 0; i < 14; i++) {
      const date = shiftDateKey(TODAY, -i);
      await logWeight(date, 80);
      await addMealItem(date, 'lunch', { foodId: food.id, grams: 2500 });
    }
    expect(await refreshExpenditure(TODAY, NOW)).toMatchObject({ kind: 'measured', kcal: 2500 });
    expect(await stored()).toEqual({ kcal: 2500, updatedAt: NOW, source: 'measured' });

    // Within the week nothing is rewritten; a week later it is.
    await refreshExpenditure(TODAY, NOW + 3 * 24 * 3600 * 1000);
    expect(await stored()).toMatchObject({ updatedAt: NOW });
    await refreshExpenditure(TODAY, NOW + 8 * 24 * 3600 * 1000);
    expect(await stored()).toMatchObject({ updatedAt: NOW + 8 * 24 * 3600 * 1000 });
  });

  it('Given нет профиля и мало данных When пересчитываю Then ничего не пишется', async () => {
    await logWeight(TODAY, 80);
    expect(await refreshExpenditure(TODAY, NOW)).toBeUndefined();
    expect(await stored()).toBeUndefined();
  });

  it('Given сохранён измеренный расход, а дневник поредел When пересчитываю даже через неделю Then значение не меняется (цели те же)', async () => {
    await saveProfile(profile);
    await db.settings.put({ key: 'nutrition.expenditure', value: { kcal: 2500, updatedAt: NOW, source: 'measured' } });
    for (let i = 0; i < 14; i++) await logWeight(shiftDateKey(TODAY, -i), 80);
    const e = await refreshExpenditure(TODAY, NOW + 30 * 24 * 3600 * 1000);
    expect(e).toMatchObject({ kind: 'incomplete', loggedDays: 0, windowDays: 28 });
    expect(await stored()).toEqual({ kcal: 2500, updatedAt: NOW, source: 'measured' });
  });
});
