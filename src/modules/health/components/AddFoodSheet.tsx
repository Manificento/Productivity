import { useState, type FormEvent } from 'react';
import type { DateKey, Food } from '../../../core/types';
import { Button, Field, Input, Sheet } from '../../../ui';
import { addMealItem, useHasLoggedFood } from '../data/food';
import { formatGrams, macrosFor, MEAL_KINDS, searchFoods, type MealKind } from '../logic/nutrition';
import { CustomFoodForm } from './CustomFoodForm';

function FoodButton({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(food)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span>{food.name}</span>
        <span className="shrink-0 text-xs text-zinc-500">{Math.round(food.kcal)} ккал / 100 г</span>
      </button>
    </li>
  );
}

/** Step 2: grams for the picked food, with a soft «no new foods» warning before an event. */
function GramsForm({
  food,
  date,
  kind,
  noNewFoods,
  onDone,
  onBack,
}: {
  food: Food;
  date: DateKey;
  kind: MealKind;
  noNewFoods: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const [grams, setGrams] = useState('100');
  const [error, setError] = useState<string>();
  const logged = useHasLoggedFood(food.id);
  const value = Number(grams.replace(',', '.'));
  const preview = Number.isFinite(value) && value > 0 ? macrosFor(food, value) : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!preview) {
      setError('Укажите вес в граммах');
      return;
    }
    try {
      await addMealItem(date, kind, { foodId: food.id, grams: value });
      onDone();
    } catch {
      setError('Не удалось добавить — попробуйте ещё раз');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="mb-3 font-medium">{food.name}</p>
      <Field label="Вес, г">
        {(id) => <Input id={id} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />}
      </Field>
      {preview && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {formatGrams(preview.kcal)} ккал · Б {formatGrams(preview.protein)} · Ж {formatGrams(preview.fat)} · У{' '}
          {formatGrams(preview.carbs)}
        </p>
      )}
      {noNewFoods && logged === false && (
        <p
          role="note"
          className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Перед событием лучше без новых продуктов. Этого продукта ещё не было в дневнике.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit" className="flex-1">
          Добавить
        </Button>
      </div>
    </form>
  );
}

/** Pick a food (recent, search or a new custom one), then its weight. */
export function AddFoodSheet({
  kind,
  date,
  foods,
  recent,
  noNewFoods,
  onClose,
}: {
  kind: MealKind | undefined;
  date: DateKey;
  foods: Food[];
  recent: Food[];
  noNewFoods: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food>();
  const [creating, setCreating] = useState(false);
  const label = MEAL_KINDS.find((m) => m.kind === kind)?.label ?? '';
  const results = searchFoods(foods, query);

  const close = () => {
    setQuery('');
    setPicked(undefined);
    setCreating(false);
    onClose();
  };

  return (
    <Sheet open={kind !== undefined} title={`Добавить: ${label.toLowerCase()}`} onClose={close}>
      {kind === undefined ? null : picked ? (
        <GramsForm
          food={picked}
          date={date}
          kind={kind}
          noNewFoods={noNewFoods}
          onDone={close}
          onBack={() => setPicked(undefined)}
        />
      ) : creating ? (
        <CustomFoodForm
          initialName={query.trim()}
          onCreated={(f) => {
            setCreating(false);
            setPicked(f);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <>
          <Field label="Поиск продукта">
            {(id) => (
              <Input
                id={id}
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
          </Field>
          {query.trim() === '' && recent.length > 0 && (
            <section aria-label="Недавние продукты" className="mb-3">
              <p className="mb-2 text-sm text-zinc-500">Недавние</p>
              <ul className="flex flex-wrap gap-2">
                {recent.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(f)}
                      className="min-h-11 rounded-full bg-zinc-100 px-4 text-sm dark:bg-zinc-800"
                    >
                      {f.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {query.trim() !== '' && (
            <ul aria-label="Найденные продукты" className="mb-3">
              {results.map((f) => (
                <FoodButton key={f.id} food={f} onPick={setPicked} />
              ))}
              {results.length === 0 && <p className="py-3 text-sm text-zinc-500">Ничего не нашлось.</p>}
            </ul>
          )}
          {foods.length === 0 && <p className="mb-3 text-sm text-zinc-500">Продуктов пока нет — создайте свой.</p>}
          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            Создать свой продукт
          </Button>
        </>
      )}
    </Sheet>
  );
}
