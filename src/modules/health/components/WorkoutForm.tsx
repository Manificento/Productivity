import { useState, type FormEvent } from 'react';
import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import type { DateKey } from '../../../core/types';
import { Button, Card, Field, IconButton, Input, Select, Textarea } from '../../../ui';
import { saveWorkout } from '../data/workouts';
import { intensityWarning } from '../logic/adaptation';
import { WORKOUT_TYPES, parseDraft, type ExerciseDraft, type WorkoutDraft } from '../logic/workouts';

const RPE_HINTS: Record<number, string> = {
  1: 'очень легко',
  3: 'легко',
  5: 'умеренно',
  7: 'тяжело',
  9: 'очень тяжело',
  10: 'максимум',
};

const SMALL_INPUT = 'min-w-0';

/**
 * New workout. `initial` comes from the parent so «Повторить» can refill it
 * (the parent re-mounts the form with a new `key`).
 */
export function WorkoutForm({
  today,
  initial,
  onSaved,
  onChange,
}: {
  today: DateKey;
  initial: WorkoutDraft;
  onSaved: () => void;
  /** Any edit (e.g. to hide a stale «сохранено» message). */
  onChange?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Today's plan (adaptation only through useDailyTargets); a workout logged for a past day gets no advice.
  const targets = useDailyTargets(today);
  const warning =
    targets && draft.date === today ? intensityWarning(draft.rpe ? Number(draft.rpe) : undefined, targets) : undefined;

  const set = (patch: Partial<WorkoutDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    onChange?.();
  };
  const setExercise = (i: number, patch: Partial<ExerciseDraft>) =>
    set({ exercises: draft.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setSet = (i: number, j: number, patch: Partial<ExerciseDraft['sets'][number]>) =>
    setExercise(i, { sets: draft.exercises[i].sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) });

  const types = WORKOUT_TYPES.includes(draft.type as (typeof WORKOUT_TYPES)[number])
    ? WORKOUT_TYPES
    : [draft.type, ...WORKOUT_TYPES];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseDraft(draft, today);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      await saveWorkout(parsed.value);
      setError(undefined);
      onSaved();
    } catch {
      setError('Не удалось сохранить тренировку — попробуйте ещё раз');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Новая тренировка">
      <form onSubmit={onSubmit} noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тип">
            {(id) => (
              <Select id={id} value={draft.type} onChange={(e) => set({ type: e.target.value })}>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Дата">
            {(id) => (
              <Input
                id={id}
                type="date"
                max={today}
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            )}
          </Field>
          <Field label="Длительность, мин">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={draft.durationMin}
                onChange={(e) => set({ durationMin: e.target.value })}
              />
            )}
          </Field>
          <Field label="RPE (1–10)">
            {(id) => (
              <Select id={id} value={draft.rpe} onChange={(e) => set({ rpe: e.target.value })}>
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={n}>
                    {RPE_HINTS[n] ? `${n} — ${RPE_HINTS[n]}` : n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div aria-live="polite">
          {warning && (
            <div
              role="note"
              aria-label="Предупреждение об интенсивности"
              className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              <p className="font-medium">
                {warning.limit === 0
                  ? 'Сегодня рекомендован отдых без тренировки.'
                  : `Сегодня рекомендована ${warning.label} интенсивность — RPE до ${warning.limit}.`}{' '}
                Сохранить всё равно можно.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {warning.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {draft.exercises.map((ex, i) => (
          <fieldset key={i} className="mb-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <legend className="px-1 text-sm font-medium">Упражнение {i + 1}</legend>
            <div className="mb-2 flex gap-2">
              <Input
                aria-label={`Упражнение ${i + 1}: название`}
                placeholder="Например, жим лёжа"
                value={ex.name}
                onChange={(e) => setExercise(i, { name: e.target.value })}
              />
              <IconButton
                className="shrink-0"
                label={`Удалить упражнение ${i + 1}`}
                onClick={() => set({ exercises: draft.exercises.filter((_, k) => k !== i) })}
              >
                ✕
              </IconButton>
            </div>
            {ex.sets.map((s, j) => (
              <div key={j} className="mb-2 grid grid-cols-[auto_1fr_1fr] items-center gap-2">
                <span className="w-16 text-xs text-zinc-500">Подход {j + 1}</span>
                <Input
                  className={SMALL_INPUT}
                  aria-label={`Упражнение ${i + 1}, подход ${j + 1}: повторы`}
                  placeholder="повт."
                  inputMode="numeric"
                  value={s.reps}
                  onChange={(e) => setSet(i, j, { reps: e.target.value })}
                />
                <Input
                  className={SMALL_INPUT}
                  aria-label={`Упражнение ${i + 1}, подход ${j + 1}: вес, кг`}
                  placeholder="кг"
                  inputMode="decimal"
                  value={s.weightKg}
                  onChange={(e) => setSet(i, j, { weightKg: e.target.value })}
                />
              </div>
            ))}
            <Button
              variant="secondary"
              className="w-full"
              aria-label={`Добавить подход в упражнение ${i + 1}`}
              onClick={() => setExercise(i, { sets: [...ex.sets, { reps: '', weightKg: '' }] })}
            >
              + Подход
            </Button>
          </fieldset>
        ))}
        <Button
          variant="secondary"
          className="mb-3 w-full"
          onClick={() => set({ exercises: [...draft.exercises, { name: '', sets: [{ reps: '', weightKg: '' }] }] })}
        >
          + Упражнение
        </Button>

        <Field label="Заметка">
          {(id) => <Textarea id={id} value={draft.note} onChange={(e) => set({ note: e.target.value })} />}
        </Field>

        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={saving}>
          Сохранить тренировку
        </Button>
      </form>
    </Card>
  );
}
