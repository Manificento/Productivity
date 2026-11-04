import { useState } from 'react';
import type { Food } from '../../../core/types';
import { cacheOffFood, useOffSearch } from '../data/openFoodFacts';
import type { OffFood } from '../logic/openFoodFacts';

/**
 * Open Food Facts results for the query (debounced). Products already cached in `foods` are left
 * out — they are listed among the user's own foods. Picking one caches it, so it works offline.
 */
export function OffResults({ query, foods, onPick }: { query: string; foods: Food[]; onPick: (food: Food) => void }) {
  const search = useOffSearch(query);
  const [error, setError] = useState<string>();
  const cached = new Set(foods.flatMap((f) => (f.externalId ? [f.externalId] : [])));

  const pick = async (p: OffFood) => {
    try {
      onPick(await cacheOffFood(p));
    } catch {
      setError('Не удалось сохранить продукт — попробуйте ещё раз');
    }
  };

  if (search.status === 'idle') return null;
  const results = search.status === 'done' ? search.results.filter((p) => !cached.has(p.externalId)) : [];

  return (
    <section aria-label="Open Food Facts" className="mb-3">
      <p className="mb-1 text-sm text-zinc-500">Open Food Facts</p>
      {search.status === 'loading' && (
        <p role="status" className="py-2 text-sm text-zinc-500">
          Ищу в Open Food Facts…
        </p>
      )}
      {search.status === 'offline' && (
        <p role="alert" className="py-2 text-sm text-amber-700 dark:text-amber-400">
          Нет сети — поиск в Open Food Facts недоступен. Ваши продукты работают офлайн, или создайте свой.
        </p>
      )}
      {search.status === 'failed' && (
        <p role="alert" className="py-2 text-sm text-amber-700 dark:text-amber-400">
          Open Food Facts сейчас не отвечает. Попробуйте позже или создайте свой продукт.
        </p>
      )}
      {search.status === 'done' && results.length === 0 && (
        <p className="py-2 text-sm text-zinc-500">В Open Food Facts ничего не нашлось.</p>
      )}
      {results.length > 0 && (
        <ul aria-label="Результаты Open Food Facts">
          {results.map((p) => (
            <li key={p.externalId}>
              <button
                type="button"
                onClick={() => void pick(p)}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <span>{p.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{Math.round(p.kcal)} ккал / 100 г</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
}
