import { useRef, useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../../../ui';
import { addTask } from '../data/tasks';
import { validateTitle } from '../logic/tasks';

export function AddTaskForm() {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second tap can arrive before React re-renders with saving = true.
  const busy = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const invalid = validateTitle(title);
    if (invalid) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await addTask(title);
      setTitle('');
      setError(undefined);
    } catch {
      setError('Не удалось сохранить задачу — попробуйте ещё раз');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mb-2">
      <Field label="Новая задача" error={error}>
        {(id) => (
          <div className="flex gap-2">
            <Input
              id={id}
              value={title}
              placeholder="Например: купить молоко"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(undefined);
              }}
            />
            <Button type="submit" className="shrink-0" disabled={saving}>
              Добавить
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}
