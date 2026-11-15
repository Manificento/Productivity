import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { naturalId } from '../../../core/ids';
import { addMealItem, createFood, hasLoggedFood, loadRecentMeals, removeMealItem, setMealItemGrams } from './food';

const TODAY = '2026-11-04';
const bread = { name: 'Хлеб', kcal: 250, protein: 10, fat: 5, carbs: 40 };

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.mealLogs.clear()]);
});

describe('contract #275: mealLogs — the id is the day and the meal', () => {
  it('Given saveSleep, checkIns, habitLogs, mealLogs, weightLogs When создаётся запись Then её id — naturalId(...) — mealLogs', async () => {
    const lunch = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    expect(lunch.id).toBe(naturalId('meal', TODAY, 'lunch'));
    expect(lunch).toMatchObject({
      id: 'meal:2026-11-04:lunch',
      date: TODAY,
      kind: 'lunch',
      createdAt: 1,
      updatedAt: 1,
    });

    // More food in the same meal goes to that record; another meal or day is another id.
    expect((await addMealItem(TODAY, 'lunch', { foodId: 'b', grams: 50 }, 2)).id).toBe(lunch.id);
    await addMealItem(TODAY, 'dinner', { foodId: 'a', grams: 100 }, 3);
    await addMealItem('2026-11-05', 'lunch', { foodId: 'a', grams: 100 }, 4);
    expect((await db.mealLogs.toArray()).map((m) => m.id).sort()).toEqual([
      'meal:2026-11-04:dinner',
      'meal:2026-11-04:lunch',
      'meal:2026-11-05:lunch',
    ]);
  });
});

describe('contract #275: MealLog.items — у каждого элемента id и updatedAt', () => {
  it('Given MealLog.items When читаю тип Then у каждого элемента id и updatedAt; addMealItem, правка веса и удаление элемента работают по id', async () => {
    const first = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 50 }, 2);
    // addMealItem: every item gets its own id and the time it was added — the same food twice is two items.
    const [a, b] = meal.items;
    expect(first.items).toEqual([a]);
    expect(a).toEqual({ id: expect.any(String), foodId: 'a', grams: 150, updatedAt: 1 });
    expect(b).toEqual({ id: expect.any(String), foodId: 'a', grams: 50, updatedAt: 2 });
    expect(a.id).not.toBe(b.id);

    // The weight is changed by the item's id: only that item changes and only its `updatedAt` moves.
    await setMealItemGrams({ mealId: meal.id, itemId: b.id }, 80, 3);
    expect(await db.mealLogs.get(meal.id)).toMatchObject({
      items: [a, { ...b, grams: 80, updatedAt: 3 }],
      updatedAt: 3,
    });

    // The item is removed by its id, whatever its position is now: the other item stays as it was.
    await removeMealItem({ mealId: meal.id, itemId: a.id }, 4);
    expect(await db.mealLogs.get(meal.id)).toMatchObject({ items: [{ ...b, grams: 80, updatedAt: 3 }], updatedAt: 4 });
  });

  it('an item is found by its id after the list changed: a position remembered by the screen is not used', async () => {
    await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'b', grams: 50 }, 2);
    const [a, b] = meal.items;
    // Another tab removes the first item: `b` moves from position 1 to position 0.
    await removeMealItem({ mealId: meal.id, itemId: a.id }, 3);
    await setMealItemGrams({ mealId: meal.id, itemId: b.id }, 70, 4);
    expect((await db.mealLogs.get(meal.id))?.items).toEqual([{ ...b, grams: 70, updatedAt: 4 }]);
    // The removed item is gone: a second removal or an edit of it is an error, not a change of another item.
    await expect(removeMealItem({ mealId: meal.id, itemId: a.id })).rejects.toThrow(/не найдена/);
    await expect(setMealItemGrams({ mealId: meal.id, itemId: a.id }, 10)).rejects.toThrow(/не найдена/);
    expect((await db.mealLogs.get(meal.id))?.items).toEqual([{ ...b, grams: 70, updatedAt: 4 }]);
  });

  it('a meal emptied and filled again on the same day keeps its id, and the new item gets a new id', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    await removeMealItem({ mealId: meal.id, itemId: meal.items[0].id }, 2);
    expect(await db.mealLogs.count()).toBe(0);
    const again = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 3);
    expect(again.id).toBe(meal.id);
    expect(again.items).toEqual([{ id: expect.any(String), foodId: 'a', grams: 150, updatedAt: 3 }]);
    expect(again.items[0].id).not.toBe(meal.items[0].id);
    expect(await db.mealLogs.toArray()).toEqual([again]);
  });
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
    expect(second.items).toMatchObject([
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
    await removeMealItem({ mealId: meal.id, itemId: meal.items[0].id }, 3);
    expect(await db.mealLogs.get(meal.id)).toMatchObject({ items: [{ foodId: 'b', grams: 50 }], updatedAt: 3 });
  });

  it('deleting the last item of a meal removes the meal record', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 });
    await removeMealItem({ mealId: meal.id, itemId: meal.items[0].id });
    expect(await db.mealLogs.count()).toBe(0);
  });

  it('Given a meal item When I change its weight Then the new grams are stored', async () => {
    await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'b', grams: 50 }, 2);
    await setMealItemGrams({ mealId: meal.id, itemId: meal.items[1].id }, 80, 3);
    expect(await db.mealLogs.get(meal.id)).toMatchObject({
      items: [
        { foodId: 'a', grams: 150 },
        { foodId: 'b', grams: 80 },
      ],
      updatedAt: 3,
    });
  });

  it('changing the weight to zero, or an item that is no longer there, is an error and changes nothing', async () => {
    const meal = await addMealItem(TODAY, 'lunch', { foodId: 'a', grams: 150 }, 1);
    const at = { mealId: meal.id, itemId: meal.items[0].id };
    await expect(setMealItemGrams(at, 0)).rejects.toThrow(/граммах/);
    await expect(setMealItemGrams(at, Infinity)).rejects.toThrow(/граммах/);
    await expect(setMealItemGrams({ ...at, itemId: 'missing' }, 10)).rejects.toThrow(/не найдена/);
    await expect(removeMealItem({ ...at, itemId: 'missing' })).rejects.toThrow(/не найдена/);
    await expect(removeMealItem({ ...at, mealId: 'missing' })).rejects.toThrow(/не найдена/);
    expect((await db.mealLogs.get(meal.id))?.items).toEqual(meal.items);
  });
});
