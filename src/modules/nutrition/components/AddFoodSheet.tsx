import { useState, type FormEvent } from 'react';
import type { DateKey, Food } from '../../../core/types';
import { Button, Field, Input, Sheet } from '../../../ui';
import { addMealItem, useHasLoggedFood } from '../data/food';
import { addOffFoodToMeal } from '../data/openFoodFacts';
import { hasCaffeine } from '../logic/diary';
import type { OffFood } from '../logic/openFoodFacts';
import { formatGrams, macrosFor, MEAL_KINDS, searchFoods, type MealKind } from '../logic/nutrition';
import { CustomFoodForm } from './CustomFoodForm';
import { OffResults } from './OffResults';

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

/** A stored food, or an Open Food Facts product that is cached only when actually added. */
export type PickedFood = { food: Food } | { off: OffFood };

/** Step 2: grams for the picked food, with a soft «no new foods» warning before an event. */
function GramsForm({
  picked,
  date,
  kind,
  noNewFoods,
  caffeineLate,
  onDone,
  onBack,
}: {
  picked: PickedFood;
  date: DateKey;
  kind: MealKind;
  noNewFoods: boolean;
  caffeineLate: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const food = 'food' in picked ? picked.food : picked.off;
  const [grams, setGrams] = useState('100');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A product straight from Open Food Facts was never logged: it is new by definition.
  const storedLogged = useHasLoggedFood('food' in picked ? picked.food.id : undefined);
  const logged = 'food' in picked ? storedLogged : false;
  // Before an event, wait until we know whether the food is new, so the warning is never skipped.
  const checking = noNewFoods && logged === undefined;
  const value = Number(grams.replace(',', '.'));
  const preview = Number.isFinite(value) && value > 0 ? macrosFor(food, value) : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!preview) {
      setError('Укажите вес в граммах');
      return;
    }
    setSaving(true);
    try {
      if ('food' in picked) await addMealItem(date, kind, { foodId: picked.food.id, grams: value });
      else await addOffFoodToMeal(date, kind, picked.off, value);
      onDone();
    } catch {
      setError('Не удалось добавить — попробуйте ещё раз');
      setSaving(false);
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
      {caffeineLate && hasCaffeine(food.name) && (
        <p
          role="note"
          className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Отсечка кофеина на сегодня уже прошла — он может помешать сну. Добавить можно.
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
        <Button type="submit" className="flex-1" disabled={saving || checking}>
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
  caffeineLate,
  onClose,
}: {
  kind: MealKind | undefined;
  date: DateKey;
  foods: Food[];
  recent: Food[];
  noNewFoods: boolean;
  caffeineLate: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PickedFood>();
  const pickFood = (food: Food) => setPicked({ food });
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
          picked={picked}
          date={date}
          kind={kind}
          noNewFoods={noNewFoods}
          caffeineLate={caffeineLate}
          onDone={close}
          onBack={() => setPicked(undefined)}
        />
      ) : creating ? (
        <CustomFoodForm
          initialName={query.trim()}
          onCreated={(f) => {
            setCreating(false);
            pickFood(f);
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
                      onClick={() => pickFood(f)}
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
            <section aria-label="Мои продукты" className="mb-3">
              <p className="mb-1 text-sm text-zinc-500">Мои продукты</p>
              <ul aria-label="Найденные продукты">
                {results.map((f) => (
                  <FoodButton key={f.id} food={f} onPick={pickFood} />
                ))}
                {results.length === 0 && (
                  <li className="py-2 text-sm text-zinc-500">Среди ваших продуктов ничего нет.</li>
                )}
              </ul>
            </section>
          )}
          <OffResults query={query} foods={foods} onPick={(off) => setPicked({ off })} />
          {foods.length === 0 && query.trim() === '' && (
            <p className="mb-3 text-sm text-zinc-500">Продуктов пока нет — создайте свой.</p>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            Создать свой продукт
          </Button>
        </>
      )}
    </Sheet>
  );
}
