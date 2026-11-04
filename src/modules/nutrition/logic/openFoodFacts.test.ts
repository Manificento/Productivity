import { describe, expect, it } from 'vitest';
import { offSearchUrl, parseOffResponse } from './openFoodFacts';

describe('offSearchUrl', () => {
  it('builds the documented search request with the query encoded', () => {
    expect(offSearchUrl('гречка ядрица')).toBe(
      'https://world.openfoodfacts.org/cgi/search.pl?search_terms=%D0%B3%D1%80%D0%B5%D1%87%D0%BA%D0%B0+%D1%8F%D0%B4%D1%80%D0%B8%D1%86%D0%B0&search_simple=1&json=1&page_size=20&fields=code%2Cproduct_name%2Cproduct_name_ru%2Cnutriments',
    );
  });
});

describe('parseOffResponse', () => {
  it('maps products to foods per 100 g, preferring the Russian name', () => {
    const json = {
      products: [
        {
          code: '4600000000001',
          product_name: 'Buckwheat',
          product_name_ru: 'Гречка ядрица',
          nutriments: { 'energy-kcal_100g': 313, proteins_100g: 12.6, fat_100g: '3.3', carbohydrates_100g: 57.1 },
        },
        { code: '2', product_name: 'Rice', nutriments: { 'energy-kcal_100g': 344 } },
      ],
    };
    expect(parseOffResponse(json)).toEqual([
      { externalId: '4600000000001', name: 'Гречка ядрица', kcal: 313, protein: 12.6, fat: 3.3, carbs: 57.1 },
      { externalId: '2', name: 'Rice', kcal: 344, protein: 0, fat: 0, carbs: 0 },
    ]);
  });

  it('Given an API product without calories When results are shown Then it is skipped', () => {
    const json = {
      products: [
        { code: '1', product_name: 'Без калорий', nutriments: { proteins_100g: 5 } },
        { code: '2', product_name: 'Пустые калории', nutriments: { 'energy-kcal_100g': '' } },
        { code: '3', product_name: 'Есть', nutriments: { 'energy-kcal_100g': 100 } },
      ],
    };
    expect(parseOffResponse(json).map((p) => p.externalId)).toEqual(['3']);
  });

  it('skips products without a name or code, and malformed entries', () => {
    const json = {
      products: [
        { code: '1', nutriments: { 'energy-kcal_100g': 100 } },
        { product_name: 'Без кода', nutriments: { 'energy-kcal_100g': 100 } },
        'мусор',
        { code: '4', product_name: '  ', product_name_ru: '', nutriments: { 'energy-kcal_100g': 100 } },
        { code: '5', product_name: 'Отрицательный', nutriments: { 'energy-kcal_100g': -5 } },
      ],
    };
    expect(parseOffResponse(json)).toEqual([]);
  });

  it('an unexpected response shape is an error', () => {
    expect(() => parseOffResponse({ status: 'error' })).toThrow();
    expect(() => parseOffResponse(null)).toThrow();
  });
});
