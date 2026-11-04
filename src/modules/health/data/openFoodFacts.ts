import { useEffect, useState } from 'react';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import { addMealItem } from './food';
import type { MealKind } from '../logic/nutrition';
import type { DateKey, Food } from '../../../core/types';
import { offSearchUrl, parseOffResponse, type OffFood } from '../logic/openFoodFacts';

/** Search waits this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 400;
/** Shorter queries are not sent to the API. */
export const MIN_QUERY_LENGTH = 3;

export class OffError extends Error {
  readonly kind: 'offline' | 'failed';
  constructor(kind: 'offline' | 'failed') {
    super(kind === 'offline' ? 'Нет сети' : 'Open Food Facts не ответил');
    this.kind = kind;
  }
}

/** Searches Open Food Facts. Throws OffError('offline') without network, OffError('failed') otherwise. */
export async function searchOff(
  query: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<OffFood[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OffError('offline');
  let response: Response;
  try {
    response = await fetchImpl(offSearchUrl(query), { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    // fetch also rejects (TypeError) on a CORS-less error page, e.g. OFF's 503 rate-limit page:
    // that is «not responding», not «offline», unless the browser itself reports no network.
    throw new OffError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'failed');
  }
  if (!response.ok) throw new OffError('failed');
  try {
    return parseOffResponse(await response.json());
  } catch {
    throw new OffError('failed');
  }
}

/** Saves a picked OFF product into `foods` (once per product), so it works offline from now on. */
export async function cacheOffFood(p: OffFood, now: number = Date.now()): Promise<Food> {
  return db.transaction('rw', db.foods, async () => {
    const existing = await db.foods.where('externalId').equals(p.externalId).first();
    if (existing) return existing;
    const food: Food = newRecord({ ...p, source: 'openfoodfacts' as const }, now);
    await db.foods.add(food);
    return food;
  });
}

/** Caches the product (if it is not cached yet) and adds it to the meal: «кешируется, когда добавляю». */
export async function addOffFoodToMeal(date: DateKey, kind: MealKind, p: OffFood, grams: number): Promise<Food> {
  if (!(grams > 0)) throw new Error('Укажите вес в граммах');
  const food = await cacheOffFood(p);
  await addMealItem(date, kind, { foodId: food.id, grams });
  return food;
}

/** Results per query for this session, so going back to an earlier query costs no request. */
const sessionCache = new Map<string, OffFood[]>();

/** For tests: forget cached results. */
export function clearOffSearchCache(): void {
  sessionCache.clear();
}

export type OffSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; results: OffFood[] }
  | { status: 'offline' }
  | { status: 'failed' };

/** Debounced (400 ms) Open Food Facts search; earlier requests are aborted when the query changes. */
export function useOffSearch(query: string, fetchImpl?: typeof fetch): OffSearchState {
  const [state, setState] = useState<OffSearchState>({ status: 'idle' });
  // Bumped when the network comes back, to retry a failed search.
  const [online, setOnline] = useState(0);
  const q = query.trim();

  useEffect(() => {
    const onOnline = () => setOnline((n) => n + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (q.length < MIN_QUERY_LENGTH) {
      setState({ status: 'idle' });
      return;
    }
    const key = q.toLocaleLowerCase('ru');
    const hit = sessionCache.get(key);
    if (hit) {
      setState({ status: 'done', results: hit });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      searchOff(q, controller.signal, fetchImpl).then(
        (results) => {
          if (controller.signal.aborted) return;
          sessionCache.set(key, results);
          setState({ status: 'done', results });
        },
        (e: unknown) => {
          if (controller.signal.aborted) return;
          setState({ status: e instanceof OffError && e.kind === 'offline' ? 'offline' : 'failed' });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, fetchImpl, online]);

  return state;
}
