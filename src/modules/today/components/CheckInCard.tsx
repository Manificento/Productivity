import { useState, type FormEvent } from 'react';
import type { CheckIn, DateKey } from '../../../core/types';
import { Button, Card, Field, Rating, Textarea } from '../../../ui';
import { saveCheckIn, useCheckIn } from '../data/checkIns';
import { parseCheckIn, type CheckInFormValues } from '../logic/checkIn';

const TITLE = 'Как вы сегодня?';

function CheckInForm({ initial, date, onDone }: { initial?: CheckIn; date: DateKey; onDone: () => void }) {
  const [values, setValues] = useState<CheckInFormValues>({
    energy: initial?.energy,
    focus: initial?.focus,
    note: initial?.note ?? '',
  });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseCheckIn(values);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await saveCheckIn(date, parsed.data);
      onDone();
    } catch {
      setError('Не удалось сохранить чек-ин. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Энергия</p>
      <Rating label="Энергия" value={values.energy} onChange={(energy) => setValues((v) => ({ ...v, energy }))} />
      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Фокус</p>
      <Rating label="Фокус" value={values.focus} onChange={(focus) => setValues((v) => ({ ...v, focus }))} />
      <Field label="Заметка" hint="Необязательно">
        {(id) => (
          <Textarea
            id={id}
            value={values.note}
            maxLength={500}
            placeholder="Что влияет на состояние?"
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
        )}
      </Field>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        {initial && (
          <Button variant="secondary" className="flex-1" onClick={onDone}>
            Отмена
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={saving}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}

/** Daily energy/focus check-in at the top of «Сегодня»; one record per day. */
export function CheckInCard({ date }: { date: DateKey }) {
  const checkIn = useCheckIn(date);
  const [editing, setEditing] = useState(false);

  return (
    <section aria-label={TITLE}>
      <Card title={TITLE}>
        {checkIn === undefined ? (
          <p className="text-sm text-zinc-500">Загрузка…</p>
        ) : checkIn && !editing ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                Энергия {checkIn.energy}/5 · фокус {checkIn.focus}/5
              </p>
              {checkIn.note && <p className="truncate text-zinc-500">{checkIn.note}</p>}
            </div>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Изменить
            </Button>
          </div>
        ) : (
          <CheckInForm
            key={checkIn?.id ?? 'new'}
            initial={checkIn ?? undefined}
            date={date}
            onDone={() => setEditing(false)}
          />
        )}
      </Card>
    </section>
  );
}
