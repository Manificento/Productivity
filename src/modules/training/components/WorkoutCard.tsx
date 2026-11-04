import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fromDateKey } from '../../../core/dates';
import type { WorkoutLog } from '../../../core/types';
import { Button, IconButton } from '../../../ui';
import { formatSets } from '../logic/workouts';

export function workoutLabel(workout: WorkoutLog): string {
  return `${workout.type}, ${format(fromDateKey(workout.date), 'd MMMM', { locale: ru })}`;
}

export function WorkoutCard({
  workout,
  onRepeat,
  onDelete,
}: {
  workout: WorkoutLog;
  onRepeat: (w: WorkoutLog) => void;
  onDelete: (w: WorkoutLog) => void;
}) {
  const day = format(fromDateKey(workout.date), 'd MMMM', { locale: ru });
  return (
    <li aria-label={workoutLabel(workout)} className="border-b border-zinc-200 py-3 last:border-0 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{workout.type}</p>
          <p className="text-sm text-zinc-500">
            {day} · {workout.durationMin} мин · RPE {workout.rpe}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            aria-label={`Повторить: ${workoutLabel(workout)}`}
            onClick={() => onRepeat(workout)}
          >
            Повторить
          </Button>
          <IconButton
            label={`Удалить: ${workoutLabel(workout)}`}
            className="text-zinc-400"
            onClick={() => onDelete(workout)}
          >
            ✕
          </IconButton>
        </div>
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
