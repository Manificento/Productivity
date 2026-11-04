import { useState } from 'react';
import type { DailyTargets } from '../../../core/adaptation/types';
import type { DateKey, Task } from '../../../core/types';
import { Button, Progress } from '../../../ui';
import { deferTasks, useEventDate } from '../data/tasks';
import { deferDate, deferrable, DEFAULT_ESTIMATE_MIN, planFor } from '../logic/capacity';
import { dueLabel } from '../logic/format';

function tasksWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'задача';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи';
  return 'задач';
}

/** Today's plan against the day's capacity, and «Перенести P3–P4» when the day is overloaded. */
export function PlanCard({ tasks, today, targets }: { tasks: Task[]; today: DateKey; targets: DailyTargets }) {
  const eventDate = useEventDate(targets.activeEventId);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const plan = planFor(tasks, targets.taskCapacityMin);
  const movable = deferrable(tasks, today);
  const canDefer = targets.allowDeferLowPriority && plan.over && movable.length > 0;

  async function defer() {
    const to = deferDate(today, eventDate);
    try {
      const moved = await deferTasks(
        movable.map((t) => t.id),
        to,
      );
      setStatus(`Перенесено: ${moved} ${tasksWord(moved)} на ${dueLabel(to, today).toLowerCase()}`);
      setError(undefined);
    } catch {
      setError('Не удалось перенести задачи — попробуйте ещё раз');
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-500">План на день</span>
        <span
          className={`text-sm font-semibold ${plan.over ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}
        >
          {plan.plannedMin} из {plan.capacityMin} мин
        </span>
      </div>
      <Progress label="План на день" value={plan.plannedMin} max={plan.capacityMin} />
      {plan.over && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">План больше ёмкости дня</p>}
      {plan.unestimated > 0 && (
        <p className="mt-2 text-sm text-zinc-500">
          Без оценки: {plan.unestimated} {tasksWord(plan.unestimated)} — считаю по {DEFAULT_ESTIMATE_MIN} мин
        </p>
      )}
      {canDefer && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => void defer()}>
          Перенести P3–P4
        </Button>
      )}
      {status && (
        <p role="status" className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
