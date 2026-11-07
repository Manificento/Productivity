import { useState } from 'react';
import { daysBetween } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card } from '../../../ui';
import { extendProgram, useActivePrograms, usePlanEnds } from '../data/programs';
import { needsExtension } from '../logic/plan';

/** «Продлить план на 4 недели»: a card per active program with fewer than 7 days left in its plan (or an ended one). */
export function ExtendPlan({ today }: { today: DateKey }) {
  const programs = useActivePrograms();
  const ends = usePlanEnds();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!programs || !ends) return null;
  const due = programs.filter((p) => {
    const end = ends.get(p.id);
    return end !== undefined && needsExtension(end, today);
  });
  if (due.length === 0) return null;
  const extend = async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await extendProgram(id, today);
    } catch {
      setError('Не удалось продлить план — попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {due.map((p) => {
        const left = daysBetween(today, ends.get(p.id)!);
        return (
          <Card key={p.id} title={left < 0 ? 'План завершён' : 'План скоро закончится'}>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              {p.name}:{' '}
              {left < 0
                ? 'тренировок больше нет'
                : left === 0
                  ? 'последняя тренировка сегодня'
                  : `осталось дней: ${left}`}
            </p>
            <Button
              disabled={busy}
              aria-label={`Продлить план на 4 недели: ${p.name}`}
              onClick={() => void extend(p.id)}
            >
              Продлить план на 4 недели
            </Button>
          </Card>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </>
  );
}
