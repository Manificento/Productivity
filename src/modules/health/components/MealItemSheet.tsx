import { useState, type FormEvent } from 'react';
import type { Food } from '../../../core/types';
import { Button, Field, Input, Sheet } from '../../../ui';
import { removeMealItem, setMealItemGrams } from '../data/food';
import { formatGrams, macrosFor } from '../logic/nutrition';

/** One logged item: which meal record it is in and its position there. */
export interface MealItemRef {
  mealId: string;
  index: number;
  grams: number;
  food: Food | undefined;
  mealLabel: string;
}

const itemName = (item: MealItemRef) => item.food?.name ?? 'Удалённый продукт';

/** Edit the weight of a logged item or delete it (deleting asks first). */
export function MealItemSheet({ item, onClose }: { item: MealItemRef | undefined; onClose: () => void }) {
  return (
    <Sheet open={item !== undefined} title={item ? itemName(item) : ''} onClose={onClose}>
      {/* Re-mount per item so the field starts from that item's weight. */}
      {item && <MealItemForm key={`${item.mealId}/${item.index}`} item={item} onClose={onClose} />}
    </Sheet>
  );
}

function MealItemForm({ item, onClose }: { item: MealItemRef; onClose: () => void }) {
  const [grams, setGrams] = useState(formatGrams(item.grams));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const value = Number(grams.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch {
      setError(failure);
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError('Укажите вес в граммах');
      return;
    }
    void run(() => setMealItemGrams(item.mealId, item.index, value), 'Не удалось сохранить — попробуйте ещё раз');
  }

  if (confirming) {
    return (
      <>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Удалить «{itemName(item)}, {formatGrams(item.grams)} г» из «{item.mealLabel}»? Итоги пересчитаются.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(() => removeMealItem(item.mealId, item.index), 'Не удалось удалить — попробуйте ещё раз')
            }
          >
            Удалить
          </Button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field label="Вес, г">
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={grams}
            onChange={(e) => {
              setGrams(e.target.value);
              setError(undefined);
            }}
          />
        )}
      </Field>
      {valid && item.food && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          {formatGrams(macrosFor(item.food, value).kcal)} ккал
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Удалить
        </Button>
        <Button type="submit" disabled={busy}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
