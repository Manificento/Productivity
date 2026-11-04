import { useId, useRef, useState, type FormEvent } from 'react';
import { todayKey } from '../../../core/dates';
import { Button, Chip, Field, Input } from '../../../ui';
import { addQuickTask } from '../data/tasks';
import { previewChips } from '../logic/format';
import { parseQuickAdd } from '../logic/quickAdd';
import { draftFromQuickAdd, type ListDefaults } from '../logic/quickDraft';
import { validateTitle } from '../logic/tasks';

/**
 * Quick add field on top of every task list. The line is parsed as you type («завтра 9:00 #учёба !1»)
 * and the result is shown as chips; missing parts come from the list's `defaults`.
 * `hint` says where a task lands by default.
 */
export function AddTaskForm({ defaults = {}, hint }: { defaults?: ListDefaults; hint?: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second tap can arrive before React re-renders with saving = true.
  const busy = useRef(false);
  // The kit's Input does not take a ref, so the field is reached through the form.
  const form = useRef<HTMLFormElement>(null);
  const focusField = () => form.current?.querySelector('input')?.focus();
  const chipsId = useId();

  const today = todayKey();
  const parsed = parseQuickAdd(text, today);
  const chips = text.trim() ? previewChips(parsed, today) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const invalid = validateTitle(parsed.title);
    if (invalid) {
      setError(invalid);
      focusField();
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await addQuickTask(draftFromQuickAdd(parsed, defaults));
      setText('');
      setError(undefined);
    } catch {
      setError('Не удалось сохранить задачу — попробуйте ещё раз');
    } finally {
      busy.current = false;
      setSaving(false);
      // Ready for the next task: the tap on «Добавить» moved focus to the button.
      focusField();
    }
  }

  return (
    <form ref={form} onSubmit={submit} noValidate className="mb-2">
      <Field label="Новая задача" error={error} hint={chips.length ? undefined : hint}>
        {(id) => (
          <div className="flex gap-2">
            <Input
              id={id}
              value={text}
              placeholder="завтра 9:00 позвонить #учёба"
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
              aria-describedby={chips.length ? chipsId : undefined}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(undefined);
              }}
            />
            <Button type="submit" className="shrink-0" disabled={saving}>
              Добавить
            </Button>
          </div>
        )}
      </Field>
      {chips.length > 0 && (
        <ul id={chipsId} aria-label="Распознано" className="-mt-2 mb-3 flex flex-wrap gap-1">
          {chips.map((c) => (
            <li key={c}>
              <Chip tone="accent">{c}</Chip>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
