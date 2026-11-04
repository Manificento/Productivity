import { format } from 'date-fns';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { sleepHours } from '../../../core/adaptation/useDailyTargets';
import type { DateKey, SleepLog } from '../../../core/types';
import { Button, Card, Field, Input, Rating } from '../../../ui';
import { saveMorningSleep, skipMorningStep, useMorning } from '../data/morning';
import {
  isMorningOpen,
  MORNING_OPENS_AT_HOUR,
  morningSteps,
  parseMorningSleep,
  suggestSleep,
  type MorningStep,
  type SleepSuggestion,
  type StepState,
} from '../logic/morning';
import { CheckInCard } from './CheckInCard';

const TITLE = 'Утро: 3 минуты';
export const PVT_LINK = '/cognition/pvt?return=/';

function fmtHours(h: number): string {
  return `${h.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}

function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children: ReactNode }) {
  const mark = state === 'done' ? '✓' : state === 'skipped' ? '–' : String(n);
  return (
    <li className="flex gap-3 border-t border-zinc-200 py-3 first:border-t-0 first:pt-0 dark:border-zinc-800">
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          state === 'done'
            ? 'bg-emerald-600 text-white'
            : state === 'skipped'
              ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800'
              : 'bg-indigo-600 text-white'
        }`}
      >
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <p className="sr-only">
          Шаг {n}: {title}, {state === 'done' ? 'готово' : state === 'skipped' ? 'пропущен' : 'не заполнен'}
        </p>
        {children}
      </div>
    </li>
  );
}

function SleepStep({
  today,
  state,
  sleep,
  suggestion,
  onSkip,
}: {
  today: DateKey;
  state: StepState;
  sleep?: SleepLog;
  suggestion: SleepSuggestion;
  onSkip: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(suggestion);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  /** Opens the editor pre-filled with the saved night, or with the current suggestion. */
  function edit() {
    setValues(
      sleep
        ? { bedtime: format(sleep.bedtime, 'HH:mm'), wake: format(sleep.wakeTime, 'HH:mm'), quality: sleep.quality }
        : suggestion,
    );
    setError(undefined);
    setEditing(true);
  }

  async function save(v: SleepSuggestion) {
    const parsed = parseMorningSleep(today, v, Date.now());
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      const r = await saveMorningSleep(parsed.input);
      if (r.ok) {
        setError(undefined);
        setEditing(false);
      } else setError(r.error);
    } catch {
      setError('Не удалось сохранить сон. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  if (sleep && !editing) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>
          <span className="font-semibold">Сон</span> · {format(sleep.bedtime, 'HH:mm')}–
          {format(sleep.wakeTime, 'HH:mm')}, {fmtHours(sleepHours(sleep))}, качество {sleep.quality}/5
        </p>
        <Button variant="secondary" onClick={edit}>
          Изменить
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">Сон</h3>
      {editing ? (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Лёг">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={values.bedtime}
                  onChange={(e) => setValues((v) => ({ ...v, bedtime: e.target.value }))}
                />
              )}
            </Field>
            <Field label="Встал">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={values.wake}
                  onChange={(e) => setValues((v) => ({ ...v, wake: e.target.value }))}
                />
              )}
            </Field>
          </div>
          <Rating
            label="Качество сна"
            value={values.quality}
            onChange={(quality) => setValues((v) => ({ ...v, quality }))}
          />
          {error && (
            <p role="alert" className="mb-2 text-sm text-rose-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
              Отмена
            </Button>
            <Button className="flex-1" disabled={saving} onClick={() => save(values)}>
              Сохранить сон
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm">
            Лёг {suggestion.bedtime} · встал {suggestion.wake} · качество {suggestion.quality}/5
            {state === 'skipped' && <span className="text-zinc-500"> · пропущено</span>}
          </p>
          {error && (
            <p role="alert" className="mb-2 text-sm text-rose-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save(suggestion)}>
              Подтвердить
            </Button>
            <Button variant="secondary" onClick={edit}>
              Изменить
            </Button>
            {state === 'pending' && (
              <Button variant="secondary" onClick={onSkip} aria-label="Пропустить сон">
                Пропустить
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TestStep({ state, onSkip }: { state: StepState; onSkip: () => void }) {
  if (state === 'done') {
    return (
      <p className="text-sm">
        <span className="font-semibold">Тест внимания</span> · пройден
      </p>
    );
  }
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">Тест внимания</h3>
      <p className="mb-2 text-sm text-zinc-500">
        1 минута: объективная мера бодрости.{state === 'skipped' ? ' Сегодня пропущен.' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          to={PVT_LINK}
          className="inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Пройти тест
        </Link>
        {state === 'pending' && (
          <Button variant="secondary" onClick={onSkip} aria-label="Пропустить тест">
            Пропустить
          </Button>
        )}
      </div>
    </div>
  );
}

/** Morning flow: sleep → check-in → attention test, about three minutes; collapses to «Утро ✓». */
export function MorningCard({ today }: { today: DateKey }) {
  const m = useMorning(today);
  const [expanded, setExpanded] = useState(false);
  const [skipError, setSkipError] = useState<string>();

  if (!isMorningOpen(Date.now())) {
    return (
      <p className="mb-3 px-1 text-sm text-zinc-500">
        Утренний поток откроется в {String(MORNING_OPENS_AT_HOUR).padStart(2, '0')}:00 — сначала выспитесь.
      </p>
    );
  }

  if (!m) {
    return (
      <Card title={TITLE}>
        <p className="text-sm text-zinc-500">Загрузка…</p>
      </Card>
    );
  }

  const { steps, complete } = morningSteps(m.done, m.skipped);
  const state = (step: MorningStep) => steps.find((s) => s.step === step)!.state;
  const skip = (step: MorningStep) => () =>
    skipMorningStep(today, step).then(
      () => setSkipError(undefined),
      () => setSkipError('Не удалось сохранить. Попробуйте ещё раз.'),
    );

  if (complete && !expanded) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
        className="mb-3 flex min-h-11 w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-left text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
      >
        <span>Утро ✓</span>
        <span className="text-xs font-normal">показать</span>
      </button>
    );
  }

  return (
    <section aria-label={TITLE}>
      <Card title={complete ? 'Утро ✓' : TITLE}>
        <ol>
          <Step n={1} title="Сон" state={state('sleep')}>
            <SleepStep
              today={today}
              state={state('sleep')}
              sleep={m.sleep}
              suggestion={suggestSleep(m.lastSleep, m.baselineBedtime, Date.now())}
              onSkip={skip('sleep')}
            />
          </Step>
          <Step n={2} title="Самочувствие" state={state('checkIn')}>
            <CheckInCard date={today} embedded />
            {state('checkIn') === 'pending' && (
              <Button variant="secondary" className="mt-2 w-full" onClick={skip('checkIn')}>
                Пропустить самочувствие
              </Button>
            )}
          </Step>
          <Step n={3} title="Тест внимания" state={state('test')}>
            <TestStep state={state('test')} onSkip={skip('test')} />
          </Step>
        </ol>
        {skipError && (
          <p role="alert" className="mt-2 text-sm text-rose-600">
            {skipError}
          </p>
        )}
        {complete && (
          <Button variant="secondary" className="mt-2 w-full" onClick={() => setExpanded(false)}>
            Свернуть
          </Button>
        )}
      </Card>
    </section>
  );
}
