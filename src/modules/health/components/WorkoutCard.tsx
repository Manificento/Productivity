import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fromDateKey } from '../../../core/dates';
import type { WorkoutLog } from '../../../core/types';
import { Button } from '../../../ui';
import { formatSets } from '../logic/workouts';

export function WorkoutCard({ workout, onRepeat }: { workout: WorkoutLog; onRepeat: (w: WorkoutLog) => void }) {
  const day = format(fromDateKey(workout.date), 'd MMMM', { locale: ru });
  return (
    <li
      aria-label={`${workout.type}, ${day}`}
      className="border-b border-zinc-200 py-3 last:border-0 dark:border-zinc-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{workout.type}</p>
          <p className="text-sm text-zinc-500">
            {day} · {workout.durationMin} мин · RPE {workout.rpe}
          </p>
        </div>
        <Button variant="secondary" aria-label={`Повторить: ${workout.type}, ${day}`} onClick={() => onRepeat(workout)}>
          Повторить
        </Button>
      </div>
      {workout.exercises && workout.exercises.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {workout.exercises.map((e, i) => (
            <li key={i}>
              <span className="font-medium">{e.name}</span>
              {e.sets.length > 0 && <span className="text-zinc-600 dark:text-zinc-400">: {formatSets(e.sets)}</span>}
            </li>
          ))}
        </ul>
      )}
      {workout.note && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{workout.note}</p>}
    </li>
  );
}
