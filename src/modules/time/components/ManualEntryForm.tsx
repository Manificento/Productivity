import { format } from 'date-fns';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '../../../ui';
import type { TimeCategory } from '../../../core/types';
import { parseManualEntry, type ManualEntry } from '../logic/timer';

const LOCAL = "yyyy-MM-dd'T'HH:mm";

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
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseManualEntry({ categoryId, start, end });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await onSave(parsed.value);
    } catch {
      setError('Не удалось сохранить запись. Попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Категория">
        {(id) => (
          <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Начало">
        {(id) => <Input id={id} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}
      </Field>
      <Field label="Конец" error={error}>
        {(id) => <Input id={id} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />}
      </Field>
      <Button type="submit" className="w-full" disabled={saving}>
        Сохранить
      </Button>
    </form>
  );
}
