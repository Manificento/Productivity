import { useRef, useState, type FormEvent } from 'react';
import { Button, Field, Input } from '../../../ui';

/** Name input for creating or renaming a project. `onSubmit` throws with a Russian message on invalid names. */
export function ProjectNameForm({
  label,
  submitLabel,
  initial = '',
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second tap can arrive before React re-renders with saving = true.
  const busy = useRef(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await onSubmit(name);
      setName('');
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось сохранить проект');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mb-2">
      <Field label={label} error={error}>
        {(id) => (
          <Input
            id={id}
            value={name}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(undefined);
            }}
          />
        )}
      </Field>
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button type="submit" className={onCancel ? 'flex-1' : ''} disabled={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
