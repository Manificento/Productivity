import { useState, type FormEvent } from 'react';
import type { Baseline } from '../../../core/adaptation/types';
import type { DateKey, LifeEvent, LifeEventType, Project } from '../../../core/types';
import { Button, Field, Input, Segmented, Select } from '../../../ui';
import {
  EVENT_TYPE_LABEL,
  IMPORTANCE_LABEL,
  parseEventForm,
  type EventFields,
  type EventFormErrors,
  type EventFormValues,
} from '../logic/events';
import { PlanPreview } from './PlanPreview';

const TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABEL) as [LifeEventType, string][];
const IMPORTANCE_OPTIONS = ([1, 2, 3] as const).map((n) => ({ value: String(n), label: IMPORTANCE_LABEL[n] }));

export function EventForm({
  initial,
  projects,
  onSubmit,
  preview,
}: {
  initial: EventFormValues;
  projects: Project[];
  onSubmit: (fields: EventFields) => Promise<void>;
  /** When given, a live 10-day plan is shown under the fields and follows every change. */
  preview?: { baseline: Baseline; today: DateKey };
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Archived projects are hidden, except the one the event is already linked to.
  const projectOptions = projects.filter((p) => !p.archived || p.id === values.projectId);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  // The preview does not need a title; everything else must be valid.
  const previewFields = parseEventForm({ ...values, title: values.title.trim() || 'Событие' });
  const previewEvent: LifeEvent | undefined = previewFields.ok
    ? { ...previewFields.data, id: 'preview', createdAt: 0, updatedAt: 0 }
    : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseEventForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaveError(undefined);
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch {
      setSaveError('Не удалось сохранить событие. Попробуйте ещё раз.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Название" error={errors.title}>
        {(id) => (
          <Input
            id={id}
            value={values.title}
            placeholder="Например, IELTS"
            onChange={(e) => set('title', e.target.value)}
          />
        )}
      </Field>
      <Field label="Тип">
        {(id) => (
          <Select id={id} value={values.type} onChange={(e) => set('type', e.target.value as LifeEventType)}>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата" error={errors.date}>
          {(id) => <Input id={id} type="date" value={values.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
        <Field label="Время" hint="Необязательно" error={errors.time}>
          {(id) => <Input id={id} type="time" value={values.time} onChange={(e) => set('time', e.target.value)} />}
        </Field>
      </div>
      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Важность</p>
      <Segmented
        label="Важность"
        value={String(values.importance)}
        options={IMPORTANCE_OPTIONS}
        onChange={(v) => set('importance', Number(v) as LifeEvent['importance'])}
      />
      <Field
        label="Проект"
        hint={projectOptions.length ? 'На него пойдёт фокус в подготовке' : 'Проекты создаются в «Задачах»'}
      >
        {(id) => (
          <Select id={id} value={values.projectId} onChange={(e) => set('projectId', e.target.value)}>
            <option value="">Без проекта</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Дней подготовки" hint="От 1 до 60" error={errors.prepDays}>
        {(id) => (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            value={values.prepDays}
            onChange={(e) => set('prepDays', e.target.value)}
          />
        )}
      </Field>
      {preview && (
        <section aria-label="Как изменятся следующие 10 дней" className="mb-3">
          <h3 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Как изменятся следующие 10 дней</h3>
          {previewEvent ? (
            <PlanPreview event={previewEvent} baseline={preview.baseline} today={preview.today} />
          ) : (
            <p className="text-sm text-zinc-500">Укажите дату и дни подготовки, чтобы увидеть план.</p>
          )}
        </section>
      )}
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
