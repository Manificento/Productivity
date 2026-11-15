import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { db, softDelete } from '../../../core/db';
import { naturalId, newId, newRecord, touch } from '../../../core/ids';
import type { DateKey, Food, Id, MealItem, MealLog } from '../../../core/types';
import type { FoodInput, MealKind } from '../logic/nutrition';

/** How far back «recent foods» look. */
export const RECENT_DAYS = 60;

export async function createFood(input: FoodInput, now: number = Date.now()): Promise<Food> {
  const food: Food = newRecord({ ...input, source: 'custom' as const }, now);
  await db.foods.add(food);
  return food;
}

/**
 * Appends an item to the day's meal of that kind (one MealLog per day and kind, its id is
 * `naturalId('meal', date, kind)`). The item gets its own `id` and `updatedAt` (#275): the sync unites the lists of
 * two devices by item id instead of losing one of them.
 */
export async function addMealItem(
  date: DateKey,
  kind: MealKind,
  food: { foodId: string; grams: number },
  now: number = Date.now(),
): Promise<MealLog> {
  if (!validGrams(food.grams)) throw new Error('Укажите вес в граммах');
  const item: MealItem = { id: newId(), foodId: food.foodId, grams: food.grams, updatedAt: now };
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
    const created: MealLog = newRecord({ date, time: now, kind, items: [item] }, now, naturalId('meal', date, kind));
    await db.mealLogs.add(created);
    return created;
  });
}

/** Which logged item: its meal record and the item's `id` there (never its position — the list changes). */
export interface MealItemAt {
  mealId: Id;
  itemId: Id;
}

const validGrams = (grams: number) => Number.isFinite(grams) && grams > 0;

/** Changes the weight of one logged item; the item's `updatedAt` moves with it. */
export async function setMealItemGrams(at: MealItemAt, grams: number, now: number = Date.now()): Promise<void> {
  if (!validGrams(grams)) throw new Error('Укажите вес в граммах');
  await updateItems(at, now, (items) =>
    items.map((item) => (item.id === at.itemId ? { ...item, grams, updatedAt: now } : item)),
  );
}

/** Removes one logged item; a meal left without items is removed too. */
export async function removeMealItem(at: MealItemAt, now: number = Date.now()): Promise<void> {
  await updateItems(at, now, (items) => items.filter((item) => item.id !== at.itemId));
}

/** Fails when the item is no longer in the meal (removed in another tab) — nothing else is touched then. */
async function updateItems(at: MealItemAt, now: number, change: (items: MealItem[]) => MealItem[]): Promise<void> {
  await db.transaction('rw', db.mealLogs, async () => {
    const meal = await db.mealLogs.get(at.mealId);
    if (!meal?.items.some((item) => item.id === at.itemId)) throw new Error('Позиция не найдена — обновите экран');
    const items = change(meal.items);
    if (items.length === 0) await softDelete(db.mealLogs, at.mealId, now);
    else await db.mealLogs.put({ ...meal, ...touch({ items }, now) });
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
