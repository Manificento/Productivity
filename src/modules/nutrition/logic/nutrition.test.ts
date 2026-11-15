import { describe, expect, it } from 'vitest';
import type { Food, MealLog } from '../../../core/types';
import {
  dayTotals,
  formatGrams,
  macrosFor,
  parseFoodDraft,
  recentFoodIds,
  searchFoods,
  sumMacros,
  type FoodDraft,
} from './nutrition';

const food = (id: string, name: string, kcal = 250, protein = 10, fat = 5, carbs = 40): Food => ({
  id,
  name,
  kcal,
  protein,
  fat,
  carbs,
  source: 'custom',
  createdAt: 0,
  updatedAt: 0,
});

const meal = (kind: MealLog['kind'], items: { foodId: string; grams: number }[], updatedAt = 0): MealLog => ({
  id: kind + updatedAt,
  date: '2026-11-04',
  time: 0,
  kind,
  items: items.map((item, i) => ({ ...item, id: `${kind}-${i}`, updatedAt })),
  createdAt: 0,
  updatedAt,
});

describe('macrosFor', () => {
  it('Given a food of 250 kcal, P 10, F 5, C 40 per 100 g When I add 150 g to lunch Then lunch has 375 kcal, P 15, F 7.5, C 60', () => {
    expect(macrosFor(food('a', 'Хлеб'), 150)).toEqual({ kcal: 375, protein: 15, fat: 7.5, carbs: 60 });
  });
});

describe('dayTotals', () => {
  it('Given meals of the day When the screen opens Then totals per meal and for the day are computed', () => {
    const foods = new Map([
      ['a', food('a', 'Хлеб')],
      ['b', food('b', 'Яблоко', 50, 0, 0, 12)],
    ]);
    const totals = dayTotals(
      [
        meal('lunch', [
          { foodId: 'a', grams: 150 },
          { foodId: 'b', grams: 200 },
        ]),
        meal('breakfast', [{ foodId: 'b', grams: 100 }]),
      ],
      foods,
    );
    expect(totals.byKind.lunch).toEqual({ kcal: 475, protein: 15, fat: 7.5, carbs: 84 });
    expect(totals.byKind.breakfast).toEqual({ kcal: 50, protein: 0, fat: 0, carbs: 12 });
    expect(totals.byKind.dinner).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
    expect(totals.day).toEqual({ kcal: 525, protein: 15, fat: 7.5, carbs: 96 });
  });

  it('items whose food is missing are skipped', () => {
    expect(dayTotals([meal('lunch', [{ foodId: 'gone', grams: 100 }])], new Map()).day.kcal).toBe(0);
  });

  it('sumMacros of nothing is zero', () => {
    expect(sumMacros([])).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });
});

describe('parseFoodDraft', () => {
  const draft = (patch: Partial<FoodDraft>): FoodDraft => ({
    name: 'Творог 5%',
    kcal: '121',
    protein: '17,2',
    fat: '5',
    carbs: '1,8',
    ...patch,
  });

  it('Given I create my own food When I enter a name and macros per 100 g Then it is valid (decimal comma accepted)', () => {
    expect(parseFoodDraft(draft({}))).toEqual({
      ok: true,
      value: { name: 'Творог 5%', kcal: 121, protein: 17.2, fat: 5, carbs: 1.8 },
    });
  });

  it('negative values are an error', () => {
    expect(parseFoodDraft(draft({ fat: '-1' }))).toEqual({
      ok: false,
      error: 'КБЖУ не могут быть отрицательными',
    });
  });

  it('an empty name or a non-number is an error', () => {
    expect(parseFoodDraft(draft({ name: '  ' }))).toEqual({ ok: false, error: 'Укажите название продукта' });
    expect(parseFoodDraft(draft({ kcal: '' }))).toEqual({ ok: false, error: 'Укажите ккал и БЖУ числами на 100 г' });
    expect(parseFoodDraft(draft({ carbs: 'много' }))).toEqual({
      ok: false,
      error: 'Укажите ккал и БЖУ числами на 100 г',
    });
  });

  it('protein + fat + carbs above 100 g per 100 g is an error', () => {
    expect(parseFoodDraft(draft({ protein: '60', fat: '30', carbs: '20' }))).toEqual({
      ok: false,
      error: 'Б + Ж + У не могут быть больше 100 г на 100 г',
    });
  });
});

describe('searchFoods', () => {
  const foods = [food('1', 'Гречка'), food('2', 'Творог'), food('3', 'Чёрный хлеб'), food('4', 'Гречневая лапша')];

  it('Given my own food When I search Then it is found by part of the name, case- and ё-insensitive', () => {
    expect(searchFoods(foods, 'греч').map((f) => f.name)).toEqual(['Гречка', 'Гречневая лапша']);
    expect(searchFoods(foods, 'черный').map((f) => f.name)).toEqual(['Чёрный хлеб']);
  });

  it('an empty query finds nothing', () => {
    expect(searchFoods(foods, '  ')).toEqual([]);
  });
});

describe('recentFoodIds', () => {
  it('Given recent foods When I add a meal Then the last 10 distinct foods are offered, newest first', () => {
    const meals = [
      meal('breakfast', [{ foodId: 'a', grams: 1 }], 1),
      meal(
        'lunch',
        Array.from({ length: 11 }, (_, i) => ({ foodId: `f${i}`, grams: 1 })),
        2,
      ),
      meal('dinner', [{ foodId: 'f3', grams: 1 }], 3),
    ];
    expect(recentFoodIds(meals)).toEqual(['f3', 'f10', 'f9', 'f8', 'f7', 'f6', 'f5', 'f4', 'f2', 'f1']);
  });
});

describe('formatGrams', () => {
  it('one decimal with a Russian comma, no trailing zero', () => {
    expect(formatGrams(7.5)).toBe('7,5');
    expect(formatGrams(15)).toBe('15');
    expect(formatGrams(0.04)).toBe('0');
  });
});
