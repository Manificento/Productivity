import { Link } from 'react-router-dom';
import { Card } from '../../../ui';
import type { MindSession } from '../../../core/types';
import { planMindTraining, planProgress, type PlanInput } from '../logic/plan';

const TITLE = { nback: 'n-back', stroop: 'Струп', schulte: 'Шульте' } as const;

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/** «План на сегодня» from the day's targets, with progress and the day's finished sessions. */
export function MindPlanCard({ targets, sessions }: { targets: PlanInput; sessions: MindSession[] }) {
  const plan = planMindTraining(targets);
  const reasons = targets.reasons.filter((r) => /тренажёр|экзамен|taper|облегч/i.test(r));
  const done = sessions.filter((s) => s.kind in TITLE);

  if (plan.kind === 'none') {
    return (
      <Card title="План на сегодня">
        <p className="text-base font-medium">
          {plan.cause ? `Сегодня без тренажёров: ${plan.cause}` : 'Сегодня без тренажёров'}
        </p>
        <p className="mt-1 text-sm text-zinc-500">Тренажёры доступны вручную — выберите упражнение ниже.</p>
        {reasons.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-zinc-500 dark:text-zinc-400">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  const progress = planProgress(
    plan.totalMin,
    done.map((s) => s.durationMs),
  );
  return (
    <Card title="План на сегодня">
      <p className="text-base font-medium">
        {`Сегодня ${plan.totalMin} мин: ${plan.items.map((i) => `${TITLE[i.kind]} ${i.min} мин`).join(', ')}`}
      </p>
      {plan.light && (
        <p className="mt-1 text-sm text-zinc-500">Лёгкий день: только короткие сессии, тест внимания PVT доступен.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {plan.items.map((i) => (
          <Link
            key={i.kind}
            to={`/cognition/${i.kind}`}
            className="flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {`Начать: ${TITLE[i.kind]}`}
          </Link>
        ))}
      </div>
      <p
        role="status"
        className={`mt-3 text-sm ${progress.closed ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-zinc-500'}`}
      >
        {progress.closed
          ? `✓ План выполнен: ${progress.doneMin} мин`
          : `Выполнено ${progress.doneMin} из ${plan.totalMin} мин`}
      </p>
      {done.length > 0 && (
        <ul className="mt-1 text-sm text-zinc-500" aria-label="Сегодня сделано">
          {done.map((s) => (
            <li key={s.id}>{`${TITLE[s.kind as keyof typeof TITLE]} — ${minutes(s.durationMs)} мин`}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
