import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { fromDateKey } from '../../../core/dates';
import { deleteSleep } from '../../../core/logging/sleep';
import type { SleepLog } from '../../../core/types';
import { Button, Sheet } from '../../../ui';

/** «Удалить запись» for the night of the chosen wake-up day; asks before deleting (contract C1: `deleteSleep`). */
export function DeleteSleep({ log, onDeleted }: { log: SleepLog; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const day = format(fromDateKey(log.date), 'd MMMM', { locale: ru });

  const close = () => {
    setConfirming(false);
    setError(undefined);
  };
  async function remove() {
    try {
      await deleteSleep(log.id);
      close();
      onDeleted();
    } catch {
      setError('Не удалось удалить — попробуйте ещё раз');
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        className="mt-2 w-full text-rose-600 dark:text-rose-400"
        onClick={() => setConfirming(true)}
      >
        Удалить запись за {day}
      </Button>
      <Sheet open={confirming} title="Удалить запись сна?" onClose={close}>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Сон с подъёмом {day} будет удалён из графика и среднего.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={close}>
            Отмена
          </Button>
          <Button variant="danger" onClick={() => void remove()}>
            Удалить
          </Button>
        </div>
      </Sheet>
    </>
  );
}
