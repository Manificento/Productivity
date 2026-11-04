import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { addMealItem, createFood, hasLoggedFood, loadRecentMeals, removeMealItem, setMealItemGrams } from './food';

const TODAY = '2026-11-04';
const bread = { name: 'Хлеб', kcal: 250, protein: 10, fat: 5, carbs: 40 };

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.mealLogs.clear()]);
});

describe('food data', () => {
  it('Given I create my own food Then it is stored as a custom food', async () => {
    const f = await createFood(bread, 5);
    expect(await db.foods.get(f.id)).toMatchObject({ ...bread, source: 'custom', createdAt: 5 });
  });

  it('adding to lunch twice keeps one lunch record with both items', async () => {
    const f = await createFood(bread);
    await addMealItem(TODAY, 'lunch', { foodId: f.id, grams: 150 }, 1);
    const second = await addMealItem(TODAY, 'lunch', { foodId: f.id, grams: 50 }, 2);
    await addMealItem(TODAY, 'dinner', { foodId: f.id, grams: 100 }, 3);
    const meals = await db.mealLogs.where('date').equals(TODAY).toArray();
    expect(meals).toHaveLength(2);
    expect(second.items).toEqual([
      { foodId: f.id, grams: 150 },
      { foodId: f.id, grams: 50 },
    ]);
    expect(second.updatedAt).toBe(2);
  });

  it('rejects zero or negative grams', async () => {
    await expect(addMealItem(TODAY, 'lunch', { foodId: 'x', grams: 0 })).rejects.toThrow(/граммах/);
    expect(await db.mealLogs.count()).toBe(0);
  });

  it('hasLoggedFood tells whether a food was ever eaten', async () => {
    const f = await createFood(bread);
    expect(await hasLoggedFood(f.id)).toBe(false);
    await addMealItem('2025-01-01', 'snack', { foodId: f.id, grams: 10 });
    expect(await hasLoggedFood(f.id)).toBe(true);
  });

  it('recent meals cover the last 60 days', async () => {
    await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 1 });
    await addMealItem('2026-09-06', 'lunch', { foodId: 'b', grams: 1 });
    await addMealItem('2026-09-05', 'lunch', { foodId: 'c', grams: 1 });
    expect((await loadRecentMeals(TODAY)).map((m) => m.date).sort()).toEqual(['2026-09-06', TODAY]);
  });

  it('Given a meal item When I delete it Then only that item is removed', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    await addMealItem(TODAY, 'lunch', { foodId: 'b', grams: 50 }, 2);
    await removeMealItem(meal.id, 0, 3);
    expect(await db.mealLogs.get(meal.id)).toMatchObject({ items: [{ foodId: 'b', grams: 50 }], updatedAt: 3 });
  });

  it('deleting the last item of a meal removes the meal record', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 });
    await removeMealItem(meal.id, 0);
    expect(await db.mealLogs.count()).toBe(0);
  });

  it('Given a meal item When I change its weight Then the new grams are stored', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    await addMealItem(TODAY, 'lunch', { foodId: 'b', grams: 50 }, 2);
    await setMealItemGrams(meal.id, 1, 80, 3);
    expect(await db.mealLogs.get(meal.id)).toMatchObject({
      items: [
        { foodId: 'a', grams: 150 },
        { foodId: 'b', grams: 80 },
      ],
      updatedAt: 3,
    });
  });

  it('changing the weight to zero or a missing item is an error and changes nothing', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 });
    await expect(setMealItemGrams(meal.id, 0, 0)).rejects.toThrow(/граммах/);
    await expect(setMealItemGrams(meal.id, 5, 10)).rejects.toThrow(/не найдена/);
    await expect(removeMealItem('missing', 0)).rejects.toThrow(/не найдена/);
    expect((await db.mealLogs.get(meal.id))?.items).toEqual([{ foodId: 'a', grams: 150 }]);
  });
});
