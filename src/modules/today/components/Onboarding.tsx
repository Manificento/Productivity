import { useState, type FormEvent } from 'react';
import { todayKey } from '../../../core/dates';
import type { DateKey, LifeEvent } from '../../../core/types';
import { Button, Card, Field, Input, Page, Segmented } from '../../../ui';
import { createEvent } from '../data/events';
import { finishOnboarding } from '../data/onboarding';
import { emptyEventForm, IMPORTANCE_LABEL, parseEventForm, type EventFormErrors } from '../logic/events';
import { PlanPreview } from './PlanPreview';

const IMPORTANCE_OPTIONS = ([1, 2, 3] as const).map((n) => ({ value: String(n), label: IMPORTANCE_LABEL[n] }));

/**
 * First run: instead of empty trackers, ask for the nearest important event and show at once how the next
 * 10 days will adapt to it. «Начать» or «Пропустить» marks onboarding as done.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const today = todayKey();
  const [event, setEvent] = useState<LifeEvent>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function done() {
    setBusy(true);
    try {
      await finishOnboarding();
      onDone();
    } catch {
      setError('Не удалось сохранить. Попробуйте ещё раз.');
      setBusy(false);
    }
  }

  return event ? (
    <PlanStep event={event} today={today} error={error} busy={busy} onStart={done} />
  ) : (
    <EventStep today={today} error={error} busy={busy} onCreated={setEvent} onSkip={done} />
  );
}

function EventStep({
  today,
  error,
  busy,
  onCreated,
  onSkip,
}: {
  today: DateKey;
  error?: string;
  busy: boolean;
  onCreated: (e: LifeEvent) => void;
  onSkip: () => void;
}) {
  const [values, setValues] = useState(() => emptyEventForm(today));
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);

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
      const now = Date.now();
      const id = await createEvent(parsed.data, now);
      // The event is the point of onboarding: once it exists, leaving via the navigation also counts as done.
      // «Начать» writes the flag again, so a failure here only costs a retry there.
      void finishOnboarding().catch(() => {});
      onCreated({ ...parsed.data, id, createdAt: now, updatedAt: now });
    } catch {
      setSaveError('Не удалось сохранить событие. Попробуйте ещё раз.');
      setSaving(false);
    }
  }

  return (
    <Page title="Какое у тебя ближайшее важное событие?">
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Экзамен, дедлайн, собеседование — приложение подстроит под него сон, нагрузку и фокус.
      </p>
      <form onSubmit={submit} noValidate>
        <Field label="Название" error={errors.title}>
          {(id) => (
            <Input
              id={id}
              value={values.title}
              placeholder="Например, IELTS"
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            />
          )}
        </Field>
        <Field label="Дата" error={errors.date}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={values.date}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
            />
          )}
        </Field>
        <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Важность</p>
        <Segmented
          label="Важность"
          value={String(values.importance)}
          options={IMPORTANCE_OPTIONS}
          onChange={(v) => setValues((s) => ({ ...s, importance: Number(v) as LifeEvent['importance'] }))}
        />
        {(saveError ?? error) && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {saveError ?? error}
          </p>
        )}
        <Button type="submit" className="mb-2 w-full" disabled={saving || busy}>
          Дальше
        </Button>
      </form>
      <Button variant="secondary" className="w-full" disabled={saving || busy} onClick={onSkip}>
        Пропустить
      </Button>
    </Page>
  );
}

function PlanStep({
  event,
  today,
  error,
  busy,
  onStart,
}: {
  event: LifeEvent;
  today: DateKey;
  error?: string;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <Page title="Твой план на 10 дней">
      <Card title={event.title}>
        <PlanPreview event={event} today={today} />
      </Card>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Цели каждого дня на «Сегодня» будут меняться по этому плану. Событие можно изменить в «Событиях».
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={busy} onClick={onStart}>
        Начать
      </Button>
    </Page>
  );
}
