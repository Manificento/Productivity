import { useState } from 'react';
import type { PlannedSession, Program } from '../../../core/types';
import { Button, Field, Input, Sheet } from '../../../ui';
import { completeSession, replaceExercise } from '../data/programs';
import { exerciseLine } from '../logic/programs';
import { buildWorkout, draftFromExercises, toggleSet, workoutTypeFor } from '../logic/session';

/** Today's session: check off sets, swap an exercise for this day only, finish → journal entry. */
export function SessionRunner({ program, session }: { program: Program; session: PlannedSession }) {
  const [draft, setDraft] = useState(() => draftFromExercises(session.exercises));
  const [duration, setDuration] = useState('');
  const [rpe, setRpe] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState<number>();
  const [newName, setNewName] = useState('');

  // The plan itself (names) lives in the session record; the checked sets are local until «Завершить».
  const shown = draft.map((d, i) => ({ ...d, exercise: session.exercises[i] ?? d.exercise }));

  async function finish() {
    const built = buildWorkout(shown, {
      date: session.date,
      durationMin: duration,
      rpe,
      type: workoutTypeFor(program.name),
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    try {
      await completeSession(session.id, built.value);
    } catch {
      setError('Не удалось сохранить тренировку — попробуйте ещё раз');
      setSaving(false);
    }
  }

  async function confirmReplace() {
    const name = newName.trim();
    if (replacing === undefined || !name) return;
    try {
      await replaceExercise(session.id, replacing, name);
      setReplacing(undefined);
    } catch {
      setError('Не удалось заменить упражнение — попробуйте ещё раз');
    }
  }

  return (
    <>
      <p className="mb-2 text-sm text-zinc-500">{program.name}</p>
      <ul aria-label="Сессия на сегодня">
        {shown.map((d, i) => (
          <li key={i} className="border-b border-zinc-200 py-2 last:border-0 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-sm">{exerciseLine(d.exercise)}</p>
              <Button
                variant="secondary"
                aria-label={`Заменить упражнение: ${d.exercise.name}`}
                onClick={() => {
                  setReplacing(i);
                  setNewName(d.exercise.name);
                }}
              >
                Заменить
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {d.done.map((done, j) => (
                <button
                  key={j}
                  type="button"
                  aria-pressed={done}
                  aria-label={`Подход ${j + 1}: ${d.exercise.name}`}
                  onClick={() => setDraft((cur) => toggleSet(cur, i, j))}
                  className={`size-11 rounded-xl text-sm font-medium ${
                    done ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                  }`}
                >
                  {done ? '✓' : j + 1}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Длительность, мин">
          {(id) => <Input id={id} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />}
        </Field>
        <Field label="RPE (1–10)">
          {(id) => <Input id={id} inputMode="numeric" value={rpe} onChange={(e) => setRpe(e.target.value)} />}
        </Field>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <Button disabled={saving} className="w-full" onClick={() => void finish()}>
        Завершить
      </Button>

      <Sheet open={replacing !== undefined} title="Заменить упражнение" onClose={() => setReplacing(undefined)}>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Замена действует только на сегодняшнюю сессию.</p>
        <Field label="Новое упражнение">
          {(id) => <Input id={id} value={newName} onChange={(e) => setNewName(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setReplacing(undefined)}>
            Отмена
          </Button>
          <Button onClick={() => void confirmReplace()}>Заменить</Button>
        </div>
      </Sheet>
    </>
  );
}
