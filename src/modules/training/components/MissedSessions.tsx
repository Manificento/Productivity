import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, PlannedSession } from '../../../core/types';
import { Button, Card, Chip, Field, Input, Sheet } from '../../../ui';
import { rescheduleSession, useMissedSessions } from '../data/programs';

const dayLabel = (date: DateKey) => format(fromDateKey(date), 'EEEEEE, d MMMM', { locale: ru });

function RescheduleSheet({
  session,
  today,
  onClose,
}: {
  session?: PlannedSession;
  today: DateKey;
  onClose: () => void;
}) {
  const [date, setDate] = useState<DateKey>('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await rescheduleSession(session.id, date, today);
      setDate('');
      setError(undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось перенести — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={session !== undefined} title="Перенести сессию" onClose={onClose}>
      <Field label="Новая дата">
        {(id) => <Input id={id} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={busy || date === ''} onClick={() => void save()}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}

/** Skipped sessions of the last two weeks: grey «пропущена» and «Перенести» to another day. */
export function MissedSessions({ today }: { today: DateKey }) {
  const missed = useMissedSessions(today);
  const [moving, setMoving] = useState<PlannedSession>();
  if (!missed || missed.length === 0) return null;
  return (
    <>
      <Card title="Пропущенные сессии">
        <ul aria-label="Пропущенные сессии">
          {missed.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 border-b border-zinc-200 py-2 last:border-0 dark:border-zinc-800"
            >
              <div className="min-w-0 text-zinc-500">
                <p className="text-sm font-medium">{dayLabel(s.date)}</p>
                <p className="truncate text-xs">{s.exercises.map((e) => e.name).join(', ')}</p>
                <Chip>пропущена</Chip>
              </div>
              <Button variant="secondary" aria-label={`Перенести: ${dayLabel(s.date)}`} onClick={() => setMoving(s)}>
                Перенести
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <RescheduleSheet session={moving} today={today} onClose={() => setMoving(undefined)} />
    </>
  );
}
