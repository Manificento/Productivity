import { useState, type FormEvent } from 'react';
import type { DateKey } from '../../../core/types';
import { Button, Card, Field, IconButton, Input } from '../../../ui';
import { createProgram } from '../data/programs';
import {
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  emptyExercise,
  parseProgramDraft,
  type DayDraft,
  type ProgramDraft,
} from '../logic/programs';

/** Create a program: name, weekdays and exercises with sets. Saving also writes the 4-week plan. */
export function ProgramForm({
  today,
  initial,
  onSaved,
  onCancel,
}: {
  today: DateKey;
  initial: ProgramDraft;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const toggleDay = (weekday: number) =>
    setDraft((d) => ({
      ...d,
      days: d.days.some((x) => x.weekday === weekday)
        ? d.days.filter((x) => x.weekday !== weekday)
        : [...d.days, { weekday, exercises: [emptyExercise()] }],
    }));
  const patchDay = (weekday: number, f: (d: DayDraft) => DayDraft) =>
    setDraft((d) => ({ ...d, days: d.days.map((x) => (x.weekday === weekday ? f(x) : x)) }));
  const patchExercise = (weekday: number, i: number, patch: Partial<DayDraft['exercises'][number]>) =>
    patchDay(weekday, (day) => ({
      ...day,
      exercises: day.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)),
    }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseProgramDraft(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      await createProgram(parsed.value, today);
      onSaved();
    } catch {
      setError('Не удалось сохранить программу — попробуйте ещё раз');
      setSaving(false);
    }
  }

  const days = [...draft.days].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a.weekday as 1) - WEEKDAY_ORDER.indexOf(b.weekday as 1),
  );

  return (
    <Card title="Новая программа">
      <form onSubmit={onSubmit} noValidate>
        <Field label="Название программы">
          {(id) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
        </Field>

        <div role="group" aria-label="Дни недели" className="mb-3 flex flex-wrap gap-2">
          {WEEKDAY_ORDER.map((w) => {
            const on = draft.days.some((d) => d.weekday === w);
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(w)}
                className={`size-11 rounded-xl text-sm font-medium ${
                  on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                }`}
              >
                {WEEKDAY_SHORT[w]}
              </button>
            );
          })}
        </div>

        {days.map((day) => {
          const wd = WEEKDAY_SHORT[day.weekday];
          return (
            <fieldset key={day.weekday} className="mb-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <legend className="px-1 text-sm font-medium">{wd}</legend>
              {day.exercises.map((ex, i) => (
                <div key={i} className="mb-3 grid grid-cols-3 gap-2">
                  <div className="col-span-3 flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
                        Упражнение
                        <Input
                          aria-label={`Упражнение ${i + 1}, ${wd}`}
                          value={ex.name}
                          onChange={(e) => patchExercise(day.weekday, i, { name: e.target.value })}
                        />
                      </label>
                    </div>
                    <IconButton
                      label={`Убрать упражнение ${i + 1}, ${wd}`}
                      onClick={() =>
                        patchDay(day.weekday, (d) => ({ ...d, exercises: d.exercises.filter((_, k) => k !== i) }))
                      }
                    >
                      ✕
                    </IconButton>
                  </div>
                  {(
                    [
                      ['sets', 'Подходы'],
                      ['reps', 'Повторы'],
                      ['weightKg', 'Вес, кг'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block text-sm text-zinc-600 dark:text-zinc-400">
                      {label}
                      <Input
                        aria-label={`${label} ${i + 1}, ${wd}`}
                        inputMode="decimal"
                        className="min-w-0"
                        value={ex[key]}
                        onChange={(e) => patchExercise(day.weekday, i, { [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() => patchDay(day.weekday, (d) => ({ ...d, exercises: [...d.exercises, emptyExercise()] }))}
              >
                Добавить упражнение ({wd})
              </Button>
            </fieldset>
          );
        })}

        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" disabled={saving}>
            Сохранить программу
          </Button>
        </div>
      </form>
    </Card>
  );
}
