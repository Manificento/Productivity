import { useState, type FormEvent } from 'react';
import { sleepHours, sleepWindow } from '../../../core/logging/sleepTime';
import type { DateKey } from '../../../core/types';
import { Button, Card, Field, Input, Rating } from '../../../ui';
import { logSleep } from '../data/sleep';
import { DEFAULT_BEDTIME, DEFAULT_QUALITY, DEFAULT_WAKE, formatHours } from '../logic/sleep';

function previewHours(wakeDay: DateKey, bedtime: string, wake: string): number | undefined {
  try {
    return sleepHours(sleepWindow(wakeDay, bedtime, wake));
  } catch {
    return undefined;
  }
}

/** Log last night: defaults to bed yesterday 23:30, up today 07:30. */
export function SleepForm({ today, hasRecord }: { today: DateKey; hasRecord: (day: DateKey) => boolean }) {
  const [wakeDay, setWakeDay] = useState(today);
  const [bedtime, setBedtime] = useState(DEFAULT_BEDTIME);
  const [wake, setWake] = useState(DEFAULT_WAKE);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();

  const hours = previewHours(wakeDay, bedtime, wake);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(undefined);
    const result = await logSleep({ wakeDay, bedtime, wake, quality });
    if (result.ok) {
      setError(undefined);
      setSaved(`Сохранено: ${formatHours(sleepHours(result.log))}`);
    } else {
      setError(result.error);
    }
  }

  return (
    <Card title="Прошлая ночь">
      <form onSubmit={onSubmit} noValidate>
        <Field label="День подъёма">
          {(id) => (
            <Input id={id} type="date" max={today} value={wakeDay} onChange={(e) => setWakeDay(e.target.value)} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Отбой">
            {(id) => <Input id={id} type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />}
          </Field>
          <Field label="Подъём">
            {(id) => <Input id={id} type="time" value={wake} onChange={(e) => setWake(e.target.value)} />}
          </Field>
        </div>
        <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Качество сна</p>
        <Rating label="Качество сна" value={quality} onChange={setQuality} />
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Длительность: <strong>{hours === undefined ? '—' : formatHours(hours)}</strong>
          {hasRecord(wakeDay) && ' · запись за этот день уже есть, сохранение её обновит'}
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
            {saved}
          </p>
        )}
        <Button type="submit" className="w-full">
          Сохранить сон
        </Button>
      </form>
    </Card>
  );
}
