import type { Food, MealLog } from '../../../core/types';

export type MealKind = MealLog['kind'];

export const MEAL_KINDS: { kind: MealKind; label: string }[] = [
  { kind: 'breakfast', label: 'Завтрак' },
  { kind: 'lunch', label: 'Обед' },
  { kind: 'dinner', label: 'Ужин' },
  { kind: 'snack', label: 'Перекус' },
];

export const RECENT_FOODS = 10;

export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

const ZERO: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

/** Rounds away floating-point noise (0.1 + 0.2) without losing the decimals people see. */
const tidy = (n: number) => Math.round(n * 1_000) / 1_000;

/** Macros of `grams` of a food whose values are per 100 g. */
export function macrosFor(food: Pick<Food, 'kcal' | 'protein' | 'fat' | 'carbs'>, grams: number): Macros {
  const k = grams / 100;
  return {
    kcal: tidy(food.kcal * k),
    protein: tidy(food.protein * k),
    fat: tidy(food.fat * k),
    carbs: tidy(food.carbs * k),
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (s, m) => ({
      kcal: tidy(s.kcal + m.kcal),
      protein: tidy(s.protein + m.protein),
      fat: tidy(s.fat + m.fat),
      carbs: tidy(s.carbs + m.carbs),
    }),
    ZERO,
  );
}

export function mealMacros(meal: Pick<MealLog, 'items'>, foods: Map<string, Food>): Macros {
  return sumMacros(
    meal.items.flatMap((item) => {
      const food = foods.get(item.foodId);
      return food ? [macrosFor(food, item.grams)] : [];
    }),
  );
}

/** Totals per meal kind and for the whole day. */
export function dayTotals(
  meals: MealLog[],
  foods: Map<string, Food>,
): { byKind: Record<MealKind, Macros>; day: Macros } {
  const byKind = Object.fromEntries(
    MEAL_KINDS.map(({ kind }) => [
      kind,
      sumMacros(meals.filter((m) => m.kind === kind).map((m) => mealMacros(m, foods))),
    ]),
  ) as Record<MealKind, Macros>;
  return { byKind, day: sumMacros(Object.values(byKind)) };
}

/** '7,5' — grams with one decimal, Russian comma. */
export function formatGrams(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

export interface FoodDraft {
  name: string;
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
}

export type FoodInput = Pick<Food, 'name' | 'kcal' | 'protein' | 'fat' | 'carbs'>;

const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.trim().replace(',', '.')));

/** Validates a custom food (values per 100 g). */
export function parseFoodDraft(d: FoodDraft): { ok: true; value: FoodInput } | { ok: false; error: string } {
  const name = d.name.trim();
  if (!name) return { ok: false, error: 'Укажите название продукта' };
  const [kcal, protein, fat, carbs] = [d.kcal, d.protein, d.fat, d.carbs].map(toNumber);
  if ([kcal, protein, fat, carbs].some((n) => !Number.isFinite(n))) {
    return { ok: false, error: 'Укажите ккал и БЖУ числами на 100 г' };
  }
  if ([kcal, protein, fat, carbs].some((n) => n < 0)) return { ok: false, error: 'КБЖУ не могут быть отрицательными' };
  if (protein + fat + carbs > 100) return { ok: false, error: 'Б + Ж + У не могут быть больше 100 г на 100 г' };
  return { ok: true, value: { name, kcal, protein, fat, carbs } };
}

const normalize = (s: string) => s.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();

/** Foods whose name contains the query (case- and ё-insensitive), alphabetical. */
export function searchFoods(foods: Food[], query: string): Food[] {
  const q = normalize(query);
  if (!q) return [];
  return foods.filter((f) => normalize(f.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/** Up to 10 distinct foods, most recently logged first (later items of a meal are newer). */
export function recentFoodIds(meals: MealLog[], limit = RECENT_FOODS): string[] {
  const ids: string[] = [];
  const ordered = [...meals].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const m of ordered) {
    for (const item of [...m.items].reverse()) {
      if (!ids.includes(item.foodId)) ids.push(item.foodId);
      if (ids.length === limit) return ids;
    }
  }
  return ids;
}
