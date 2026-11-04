import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { OffError, addOffFoodToMeal, cacheOffFood, searchOff } from './openFoodFacts';

const buckwheat = { externalId: '460', name: 'Гречка', kcal: 313, protein: 12.6, fat: 3.3, carbs: 57.1 };

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.mealLogs.clear()]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('searchOff', () => {
  it('requests the documented URL and returns parsed products', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ products: [{ code: '460', product_name: 'Гречка', nutriments: { 'energy-kcal_100g': 313 } }] }),
      );
    const result = await searchOff('гречка', undefined, fetchMock);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl\?search_terms=/);
    expect(result).toEqual([{ externalId: '460', name: 'Гречка', kcal: 313, protein: 0, fat: 0, carbs: 0 }]);
  });

  it('Given no network When I search Then it fails as «offline» without calling the API', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = vi.fn();
    await expect(searchOff('гречка', undefined, fetchMock)).rejects.toEqual(new OffError('offline'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch failing while the browser is online (e.g. OFF 503 page without CORS) is «failed», not «offline»', async () => {
    await expect(
      searchOff('x', undefined, vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))),
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('fetch failing while the browser is offline is «offline»', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(true).mockReturnValue(false);
    await expect(
      searchOff('x', undefined, vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))),
    ).rejects.toMatchObject({ kind: 'offline' });
    online.mockRestore();
  });

  it('an HTTP error or a bad body is «failed»', async () => {
    await expect(searchOff('x', undefined, vi.fn().mockResolvedValue(jsonResponse({}, false)))).rejects.toMatchObject({
      kind: 'failed',
    });
    await expect(searchOff('x', undefined, vi.fn().mockResolvedValue(jsonResponse({ nope: 1 })))).rejects.toMatchObject(
      {
        kind: 'failed',
      },
    );
  });

  it('an aborted request is passed through, not reported as offline', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    await expect(searchOff('x', undefined, vi.fn().mockRejectedValue(abort))).rejects.toBe(abort);
  });
});

describe('cacheOffFood', () => {
  it('Given I pick a product from the API When I add it Then it is cached in foods with source openfoodfacts and externalId', async () => {
    const food = await cacheOffFood(buckwheat, 7);
    expect(await db.foods.get(food.id)).toMatchObject({
      ...buckwheat,
      source: 'openfoodfacts',
      createdAt: 7,
    });
  });

  it('addOffFoodToMeal caches the product and adds it to the meal in one step', async () => {
    const food = await addOffFoodToMeal('2026-11-04', 'lunch', buckwheat, 80);
    const [meal] = await db.mealLogs.toArray();
    expect(meal.items).toEqual([{ foodId: food.id, grams: 80 }]);
    expect(food.source).toBe('openfoodfacts');
  });

  it('addOffFoodToMeal with zero grams caches nothing', async () => {
    await expect(addOffFoodToMeal('2026-11-04', 'lunch', buckwheat, 0)).rejects.toThrow(/граммах/);
    expect(await db.foods.count()).toBe(0);
  });

  it('picking the same product again reuses the cached food', async () => {
    const first = await cacheOffFood(buckwheat);
    const second = await cacheOffFood({ ...buckwheat, name: 'Другое имя' });
    expect(second.id).toBe(first.id);
    expect(await db.foods.count()).toBe(1);
  });
});
