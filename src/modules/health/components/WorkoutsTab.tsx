import { useRef, useState } from 'react';
import { todayKey } from '../../../core/dates';
import type { DateKey, WorkoutLog } from '../../../core/types';
import { Card, Empty } from '../../../ui';
import { useRecentWorkouts } from '../data/workouts';
import { draftFromWorkout, emptyDraft, formatNumber, weekStats } from '../logic/workouts';
import { WorkoutCard } from './WorkoutCard';
import { WorkoutForm } from './WorkoutForm';

/** «Тренировки»: this week's volume, a new-workout form and the recent history. */
export function WorkoutsTab({ today = todayKey() }: { today?: DateKey }) {
  const workouts = useRecentWorkouts(today);
  // Bumping `version` re-mounts the form with a fresh `initial` draft.
  const [form, setForm] = useState({ version: 0, initial: emptyDraft(today) });
  const [savedNote, setSavedNote] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const repeat = (w: WorkoutLog) => {
    setForm((f) => ({ version: f.version + 1, initial: draftFromWorkout(w, today) }));
    setSavedNote(false);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const onSaved = () => {
    setForm((f) => ({ version: f.version + 1, initial: emptyDraft(today) }));
    setSavedNote(true);
  };

  const stats = workouts && weekStats(workouts, today);

  return (
    <>
      <Card title="Эта неделя">
        {stats === undefined ? (
          <Empty>Загрузка…</Empty>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-zinc-500">Минуты</dt>
              <dd className="text-xl font-semibold tabular-nums">{stats.minutes}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Тренировки</dt>
              <dd className="text-xl font-semibold tabular-nums">{stats.count}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Средний RPE</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {stats.avgRpe === undefined ? '—' : formatNumber(stats.avgRpe)}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      <div ref={formRef} className="scroll-mt-4">
        {savedNote && (
          <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
            Тренировка сохранена
          </p>
        )}
        <WorkoutForm key={form.version} today={today} initial={form.initial} onSaved={onSaved} />
      </div>

      <Card title="История">
        {workouts === undefined ? (
          <Empty>Загрузка…</Empty>
        ) : workouts.length === 0 ? (
          <Empty>Тренировок пока нет — запишите первую</Empty>
        ) : (
          <ul aria-label="История тренировок">
            {workouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} onRepeat={repeat} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
