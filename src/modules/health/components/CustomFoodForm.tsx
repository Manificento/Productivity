import { useState, type FormEvent } from 'react';
import type { Food } from '../../../core/types';
import { Button, Field, Input } from '../../../ui';
import { createFood } from '../data/food';
import { parseFoodDraft, type FoodDraft } from '../logic/nutrition';

const NUMBER_FIELDS: { key: keyof Omit<FoodDraft, 'name'>; label: string }[] = [
  { key: 'kcal', label: 'Ккал' },
  { key: 'protein', label: 'Белки, г' },
  { key: 'fat', label: 'Жиры, г' },
  { key: 'carbs', label: 'Углеводы, г' },
];

/** «Свой продукт»: name and macros per 100 g. */
export function CustomFoodForm({
  initialName = '',
  onCreated,
  onCancel,
}: {
  initialName?: string;
  onCreated: (food: Food) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<FoodDraft>({ name: initialName, kcal: '', protein: '', fat: '', carbs: '' });
  const [error, setError] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseFoodDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    try {
      onCreated(await createFood(parsed.value));
    } catch {
      setError('Не удалось сохранить продукт — попробуйте ещё раз');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Свой продукт">
      <Field label="Название">
        {(id) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
      </Field>
      <p className="mb-2 text-sm text-zinc-500">На 100 г:</p>
      <div className="grid grid-cols-2 gap-x-3">
        {NUMBER_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Назад
        </Button>
        <Button type="submit" className="flex-1">
          Создать продукт
        </Button>
      </div>
    </form>
  );
}
