import { useId, useRef, useState, type FormEvent } from 'react';
import { todayKey } from '../../../core/dates';
import { Button, Chip, Field, Input } from '../../../ui';
import { useProjects } from '../data/projects';
import { addQuickTask } from '../data/tasks';
import { previewChips } from '../logic/format';
import { findActiveProject } from '../logic/projects';
import { parseQuickAddExplicit } from '../logic/quickAdd';
import { draftFromQuickAdd, type ListDefaults } from '../logic/quickDraft';
import { validateTitle } from '../logic/tasks';

/**
 * Quick add field on top of every task list. The line is parsed as you type («завтра 9:00 #учёба !1»)
 * and the result is shown as chips; missing parts come from the list's `defaults`.
 * `hint` says where a task lands by default.
 */
export function AddTaskForm({ defaults = {}, hint }: { defaults?: ListDefaults; hint?: string }) {
  const projects = useProjects() ?? [];
  const [text, setTextState] = useState('');
  // The current line for async code: after an await the `text` of this render is stale.
  const latest = useRef('');
  const setText = (value: string) => {
    latest.current = value;
    setTextState(value);
  };
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second tap can arrive before React re-renders with saving = true.
  const busy = useRef(false);
  // The kit's Input does not take a ref, so the field is reached through the form.
  const form = useRef<HTMLFormElement>(null);
  const focusField = () => form.current?.querySelector('input')?.focus();
  const chipsId = useId();

  /** The task this line would create right now, with the list defaults applied. */
  const draftOf = (line: string) => {
    const today = todayKey();
    return { today, draft: draftFromQuickAdd(parseQuickAddExplicit(line, today), today, defaults) };
  };
  const preview = draftOf(text);
  // Show the project the task will really be bound to: an existing one under its own spelling, or the list's.
  const projectName = preview.draft.projectName
    ? (findActiveProject(projects, preview.draft.projectName)?.name ?? preview.draft.projectName)
    : projects.find((p) => p.id === preview.draft.projectId)?.name;
  const chips = text.trim() ? previewChips({ ...preview.draft, projectName }, preview.today) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    // Parse again: the day may have changed since the last render.
    const { draft } = draftOf(text);
    const invalid = validateTitle(draft.title);
    if (invalid) {
      setError(invalid);
      focusField();
      return;
    }
    busy.current = true;
    setSaving(true);
    // Clear at once: whatever is typed while saving belongs to the next task and must survive.
    const submitted = text;
    setText('');
    try {
      await addQuickTask(draft);
      setError(undefined);
    } catch {
      if (latest.current === '') {
        // Nothing typed meanwhile: put the line back for another try.
        setText(submitted);
        setError('Не удалось сохранить задачу — попробуйте ещё раз');
      } else {
        // The next task is already being typed: keep it and name the lost one so it can be retyped.
        setError(`Не удалось сохранить «${draft.title}» — попробуйте ещё раз`);
      }
    } finally {
      busy.current = false;
      setSaving(false);
      // Ready for the next task: the tap on «Добавить» moved focus to the button.
      focusField();
    }
  }

  return (
    <form ref={form} onSubmit={submit} noValidate className="mb-2">
      <Field label="Новая задача" error={error} hint={text.trim() ? undefined : hint}>
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
