import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { fromDateKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Chip, Empty, Sheet } from '../../../ui';
import { useMuscleBalance } from '../data/carry';
import { MUSCLE_GROUP_LABELS, type WeekBalance } from '../logic/balance';

function WeekTable({ title, week }: { title: string; week: WeekBalance }) {
  const from = format(fromDateKey(week.weekStart), 'd MMMM', { locale: ru });
  return (
    <section aria-label={title} className="mb-4">
      <h3 className="mb-1 text-sm font-medium">
        {title} <span className="font-normal text-zinc-500">с {from}</span>
      </h3>
      {week.rows.length === 0 ? (
        <Empty>Нет плана и тренировок</Empty>
      ) : (
        <ul>
          {week.rows.map((r) => (
            <li
              key={r.group}
              aria-label={`${MUSCLE_GROUP_LABELS[r.group]}: план ${r.plan}, факт ${r.fact}${r.under ? ', недобор' : ''}`}
              className={`flex min-h-11 items-center justify-between gap-2 border-b border-zinc-200 py-1 text-sm last:border-0 dark:border-zinc-800 ${
                r.under ? 'text-amber-800 dark:text-amber-300' : ''
              }`}
            >
              <span className="font-medium">{MUSCLE_GROUP_LABELS[r.group]}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  план {r.plan} · факт {r.fact}
                </span>
                {r.under && <Chip tone="warning">недобор</Chip>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** «Баланс групп мышц»: sets planned and done per group for this and last week; under-trained groups stand out. */
export function MuscleBalance({ today }: { today: DateKey }) {
  const [open, setOpen] = useState(false);
  const balance = useMuscleBalance(today);
  return (
    <>
      <Button variant="secondary" className="mb-4 w-full" onClick={() => setOpen(true)}>
        Баланс групп мышц
      </Button>
      <Sheet open={open} title="Баланс групп мышц" onClose={() => setOpen(false)}>
        <p className="mb-3 text-xs text-zinc-500">Подходы по группам мышц: план программы и сделанное по журналу.</p>
        {balance === undefined ? (
          <Empty>Загрузка…</Empty>
        ) : (
          <>
            <WeekTable title="Эта неделя" week={balance[0]} />
            <WeekTable title="Прошлая неделя" week={balance[1]} />
          </>
        )}
        <Button variant="secondary" className="w-full" onClick={() => setOpen(false)}>
          Закрыть
        </Button>
      </Sheet>
    </>
  );
}
