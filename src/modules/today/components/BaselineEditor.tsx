import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Baseline } from '../../../core/adaptation/types';
import type { WorkoutIntensity } from '../../../core/types';
import { Button, Card, Field, Input, Page, Select } from '../../../ui';
import { resetBaseline, saveBaseline, useBaseline } from '../data/baseline';
import {
  baselineToForm,
  INTENSITY_LABEL,
  parseBaseline,
  type BaselineFormErrors,
  type BaselineFormValues,
} from '../logic/baseline';

const INTENSITIES = Object.entries(INTENSITY_LABEL) as [WorkoutIntensity, string][];

type NumberField = 'taskCapacityMin' | 'sleepHours' | 'focusPomodoros' | 'meditationMin' | 'mindTrainingMin';

const NUMBER_FIELDS: { key: NumberField; label: string; hint: string; step?: string }[] = [
  { key: 'taskCapacityMin', label: 'Ёмкость дня, мин', hint: 'Сколько минут задач в обычный день, до 960' },
  { key: 'sleepHours', label: 'Сон, ч', hint: 'От 4 до 12 часов, шаг полчаса', step: '0.5' },
  { key: 'focusPomodoros', label: 'Фокус-сессии', hint: 'Помидоров в день' },
  { key: 'meditationMin', label: 'Медитация, мин', hint: 'От 0 до 120' },
  { key: 'mindTrainingMin', label: 'Тренажёры ума, мин', hint: 'n-back, Струп, таблицы Шульте; от 0 до 60' },
];

interface Feedback {
  status?: string;
  error?: string;
}

function BaselineForm({
  initial,
  feedback,
  onFeedback,
  onReset,
}: {
  initial: Baseline;
  feedback: Feedback;
  onFeedback: (f: Feedback) => void;
  /** Called after a successful reset; re-mounts the form so unsaved edits and errors are dropped. */
  onReset: () => void;
}) {
  const [values, setValues] = useState<BaselineFormValues>(() => baselineToForm(initial));
  const [errors, setErrors] = useState<BaselineFormErrors>({});

  const set = <K extends keyof BaselineFormValues>(key: K, value: BaselineFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    onFeedback({});
  };

  async function run(action: () => Promise<void>, done: string, after?: () => void) {
    onFeedback({});
    try {
      await action();
      after?.();
      onFeedback({ status: done });
    } catch {
      onFeedback({ error: 'Не удалось сохранить. Попробуйте ещё раз.' });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseBaseline(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      onFeedback({});
      return;
    }
    setErrors({});
    await run(() => saveBaseline(parsed.data), 'Сохранено. Цели обычного дня обновлены.');
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card title="Обычный день">
        {NUMBER_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode={f.step ? 'decimal' : 'numeric'}
                step={f.step}
                value={values[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </Field>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Отбой" error={errors.bedtime}>
            {(id) => (
              <Input id={id} type="time" value={values.bedtime} onChange={(e) => set('bedtime', e.target.value)} />
            )}
          </Field>
          <Field label="Подъём" error={errors.wakeTime}>
            {(id) => (
              <Input id={id} type="time" value={values.wakeTime} onChange={(e) => set('wakeTime', e.target.value)} />
            )}
          </Field>
          <Field label="Кофеин до" error={errors.caffeineCutoff}>
            {(id) => (
              <Input
                id={id}
                type="time"
                value={values.caffeineCutoff}
                onChange={(e) => set('caffeineCutoff', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Тренировка">
          {(id) => (
            <Select
              id={id}
              value={values.maxWorkoutIntensity}
              onChange={(e) => set('maxWorkoutIntensity', e.target.value as WorkoutIntensity)}
            >
              {INTENSITIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>
      {feedback.error && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {feedback.error}
        </p>
      )}
      <p role="status" className="mb-3 min-h-5 text-sm text-emerald-700 dark:text-emerald-400">
        {feedback.status}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => run(resetBaseline, 'Сброшено к стандартному режиму.', onReset)}>
          Сбросить
        </Button>
        <Button type="submit">Сохранить</Button>
      </div>
    </form>
  );
}

/** Editor of the user's normal day; adaptation adjusts targets relative to it. */
export function BaselineEditor() {
  const baseline = useBaseline();
  // Lives here so it survives the form re-mounting after a save.
  const [feedback, setFeedback] = useState<Feedback>({});
  const [resets, setResets] = useState(0);
  return (
    <Page title="Базовый режим">
      <Link to="/" className="mb-3 inline-flex min-h-11 items-center text-sm text-indigo-600 dark:text-indigo-400">
        ← Сегодня
      </Link>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Ваш обычный день. Перед событиями и после плохой ночи приложение меняет цели относительно него.
      </p>
      {baseline ? (
        // Re-mount the form when the stored baseline changes or after «Сбросить» (even if nothing was stored).
        <BaselineForm
          key={`${resets}:${JSON.stringify(baseline)}`}
          initial={baseline}
          feedback={feedback}
          onFeedback={setFeedback}
          onReset={() => setResets((n) => n + 1)}
        />
      ) : (
        <Card>Загрузка…</Card>
      )}
    </Page>
  );
}
