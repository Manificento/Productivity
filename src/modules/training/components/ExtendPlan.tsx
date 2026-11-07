import { useState } from 'react';
import { daysBetween } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card } from '../../../ui';
import { extendProgram, useActivePrograms, usePlanEnds } from '../data/programs';
import { needsExtension } from '../logic/plan';

/** «Продлить план на 4 недели»: a card per active program with fewer than 7 days left in its plan. */
export function ExtendPlan({ today }: { today: DateKey }) {
  const programs = useActivePrograms();
  const ends = usePlanEnds();
  const [error, setError] = useState<string>();
  if (!programs || !ends) return null;
  const due = programs.filter((p) => {
    const end = ends.get(p.id);
    return end !== undefined && needsExtension(end, today);
  });
  if (due.length === 0) return null;
  return (
    <>
      {due.map((p) => {
        const left = daysBetween(today, ends.get(p.id)!);
        return (
          <Card key={p.id} title="План скоро закончится">
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              {p.name}: {left === 0 ? 'последняя тренировка сегодня' : `осталось дней: ${left}`}
            </p>
            <Button
              aria-label={`Продлить план на 4 недели: ${p.name}`}
              onClick={() => {
                setError(undefined);
                extendProgram(p.id, today).catch(() => setError('Не удалось продлить план — попробуйте ещё раз'));
              }}
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
