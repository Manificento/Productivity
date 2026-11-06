import { useState, type FormEvent } from 'react';
import type { Habit } from '../../../core/types';
import { Button, Field, Input, Segmented } from '../../../ui';
import {
  HABIT_COLORS,
  habitFormValues,
  parseHabitForm,
  WEEKDAYS,
  type HabitFields,
  type HabitFormInput,
  type ScheduleKind,
} from '../logic/habitForm';

const KINDS: { value: ScheduleKind; label: string }[] = [
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekdays', label: 'Дни недели' },
  { value: 'timesPerWeek', label: 'N раз в неделю' },
];

type Errors = Partial<Record<'name' | 'weekdays' | 'timesPerWeek' | 'save', string>>;

export function HabitEditor({
  habit,
  onSave,
  onArchive,
}: {
  habit?: Habit | undefined;
  onSave: (fields: HabitFields) => Promise<void>;
  onArchive?: (() => Promise<void>) | undefined;
}) {
  const [values, setValues] = useState<HabitFormInput>(() => habitFormValues(habit));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<HabitFormInput>) => setValues((v) => ({ ...v, ...patch }));

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
    } catch {
      setErrors({ save: 'Не удалось сохранить. Попробуйте ещё раз' });
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseHabitForm(values);
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error });
      return;
    }
    setErrors({});
    void run(() => onSave(parsed.value));
  }

  function toggleDay(day: number) {
    set({
      weekdays: values.weekdays.includes(day) ? values.weekdays.filter((d) => d !== day) : [...values.weekdays, day],
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Название" error={errors.name}>
        {(id) => (
          <Input
            id={id}
            value={values.name}
            maxLength={80}
            aria-invalid={!!errors.name}
            placeholder="Например, зарядка"
            onChange={(e) => set({ name: e.target.value })}
          />
        )}
      </Field>

      <Segmented label="Расписание" value={values.kind} options={KINDS} onChange={(kind) => set({ kind })} />

      {values.kind === 'weekdays' && (
        <div className="mb-3">
          <div role="group" aria-label="Дни недели" className="flex gap-0.5">
            {WEEKDAYS.map((w) => {
              const on = values.weekdays.includes(w.day);
              return (
                <button
                  key={w.day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(w.day)}
                  className={`min-h-11 flex-1 rounded-xl text-sm font-medium ${
                    on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
          {errors.weekdays && (
            <p role="alert" className="mt-1 text-sm text-rose-600">
              {errors.weekdays}
            </p>
          )}
        </div>
      )}

      {values.kind === 'timesPerWeek' && (
        <Field label="Сколько раз в неделю" error={errors.timesPerWeek}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              value={values.timesPerWeek}
              aria-invalid={!!errors.timesPerWeek}
              onChange={(e) => set({ timesPerWeek: e.target.value })}
            />
          )}
        </Field>
      )}

      <label className="mb-3 flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={values.essential}
          onChange={(e) => set({ essential: e.target.checked })}
        />
        <span>
          Ключевая
          <span className="block text-xs text-zinc-500">
            Остаётся в дни режима «только ключевые» (например, экзамен)
          </span>
        </span>
      </label>

      <div role="radiogroup" aria-label="Цвет" className="mb-4 flex gap-2">
        {HABIT_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={values.color === c}
            aria-label={`Цвет ${i + 1}`}
            onClick={() => set({ color: c })}
            className={`size-11 rounded-full border-4 ${values.color === c ? 'border-zinc-900 dark:border-white' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {errors.save && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {errors.save}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={saving}>
        Сохранить
      </Button>
      {onArchive && (
        <Button variant="secondary" className="mt-2 w-full" disabled={saving} onClick={() => void run(onArchive)}>
          В архив
        </Button>
      )}
    </form>
  );
}
