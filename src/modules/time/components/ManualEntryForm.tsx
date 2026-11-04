import { format } from 'date-fns';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '../../../ui';
import type { TimeCategory } from '../../../core/types';
import { parseManualEntry, type ManualEntry, type ManualEntryInput } from '../logic/timer';

const LOCAL = "yyyy-MM-dd'T'HH:mm";

type FieldErrors = Partial<Record<keyof ManualEntryInput, string>>;

export function ManualEntryForm({
  categories,
  onSave,
}: {
  categories: TimeCategory[];
  onSave: (entry: ManualEntry) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [start, setStart] = useState(() => format(Date.now() - 3_600_000, LOCAL));
  const [end, setEnd] = useState(() => format(Date.now(), LOCAL));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaveError(undefined);
    const parsed = parseManualEntry({ categoryId, start, end });
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSave(parsed.value);
    } catch {
      setSaveError('Не удалось сохранить запись. Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Категория" error={errors.categoryId}>
        {(id) => (
          <Select
            id={id}
            value={categoryId}
            aria-invalid={!!errors.categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Начало" error={errors.start}>
        {(id) => (
          <Input
            id={id}
            type="datetime-local"
            value={start}
            aria-invalid={!!errors.start}
            onChange={(e) => setStart(e.target.value)}
          />
        )}
      </Field>
      <Field label="Конец" error={errors.end}>
        {(id) => (
          <Input
            id={id}
            type="datetime-local"
            value={end}
            aria-invalid={!!errors.end}
            onChange={(e) => setEnd(e.target.value)}
          />
        )}
      </Field>
      {saveError && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {saveError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={saving}>
        Сохранить
      </Button>
    </form>
  );
}
