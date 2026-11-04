import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { DateKey, Food, MealLog } from '../../../core/types';
import type { FoodInput, MealKind } from '../logic/nutrition';

/** How far back «recent foods» look. */
export const RECENT_DAYS = 60;

export async function createFood(input: FoodInput, now: number = Date.now()): Promise<Food> {
  const food: Food = newRecord({ ...input, source: 'custom' as const }, now);
  await db.foods.add(food);
  return food;
}

/** Appends an item to the day's meal of that kind (one MealLog per day and kind). */
export async function addMealItem(
  date: DateKey,
  kind: MealKind,
  item: { foodId: string; grams: number },
  now: number = Date.now(),
): Promise<MealLog> {
  if (!(item.grams > 0)) throw new Error('Укажите вес в граммах');
  return db.transaction('rw', db.mealLogs, async () => {
    const existing = await db.mealLogs
      .where('date')
      .equals(date)
      .filter((m) => m.kind === kind)
      .first();
    if (existing) {
      const updated: MealLog = { ...existing, ...touch({ items: [...existing.items, item] }, now) };
      await db.mealLogs.put(updated);
      return updated;
    }
    const created: MealLog = newRecord({ date, time: now, kind, items: [item] }, now);
    await db.mealLogs.add(created);
    return created;
  });
}

/** Whether this food was ever logged in a meal. */
export async function hasLoggedFood(foodId: string): Promise<boolean> {
  return (await db.mealLogs.filter((m) => m.items.some((i) => i.foodId === foodId)).count()) > 0;
}

export function useFoods(): Food[] | undefined {
  return useLiveQuery(() => db.foods.toArray(), []);
}

export function useDayMeals(date: DateKey): MealLog[] | undefined {
  return useLiveQuery(() => db.mealLogs.where('date').equals(date).toArray(), [date]);
}

export function loadRecentMeals(today: DateKey): Promise<MealLog[]> {
  return db.mealLogs
    .where('date')
    .between(shiftDateKey(today, -(RECENT_DAYS - 1)), today, true, true)
    .toArray();
}

export function useRecentMeals(today: DateKey): MealLog[] | undefined {
  return useLiveQuery(() => loadRecentMeals(today), [today]);
}

export function useHasLoggedFood(foodId: string | undefined): boolean | undefined {
  return useLiveQuery(() => (foodId ? hasLoggedFood(foodId) : undefined), [foodId]);
}
