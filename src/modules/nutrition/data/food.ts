import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { db, softDelete } from '../../../core/db';
import { naturalId, newRecord, touch } from '../../../core/ids';
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
  if (!validGrams(item.grams)) throw new Error('Укажите вес в граммах');
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

/**
 * Where a logged item sits: its meal record and position, plus what was there when the screen showed it.
 * A write fails if the item at that position has changed meanwhile (e.g. edited in another tab).
 */
export interface MealItemAt {
  mealId: string;
  index: number;
  foodId: string;
  grams: number;
}

const validGrams = (grams: number) => Number.isFinite(grams) && grams > 0;

/** Changes the weight of one logged item. */
export async function setMealItemGrams(at: MealItemAt, grams: number, now: number = Date.now()): Promise<void> {
  if (!validGrams(grams)) throw new Error('Укажите вес в граммах');
  await updateItems(at, now, (items) => items.with(at.index, { ...items[at.index], grams }));
}

/** Removes one logged item; a meal left without items is removed too. */
export async function removeMealItem(at: MealItemAt, now: number = Date.now()): Promise<void> {
  await updateItems(at, now, (items) => items.toSpliced(at.index, 1));
}

async function updateItems(
  at: MealItemAt,
  now: number,
  change: (items: MealLog['items']) => MealLog['items'],
): Promise<void> {
  await db.transaction('rw', db.mealLogs, async () => {
    const meal = await db.mealLogs.get(at.mealId);
    const current = meal?.items[at.index];
    if (!meal || current?.foodId !== at.foodId || current.grams !== at.grams) {
      throw new Error('Позиция не найдена — обновите экран');
    }
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
