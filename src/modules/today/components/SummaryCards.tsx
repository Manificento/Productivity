import { format } from 'date-fns';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DailyTargets } from '../../../core/adaptation/types';
import type { DateKey } from '../../../core/types';
import { Card, Progress } from '../../../ui';
import { useEvent } from '../data/events';
import { useSummaryData, type SummaryData } from '../data/summary';
import { INTENSITY_LABEL } from '../logic/baseline';
import {
  POMODORO_PHASE_LABEL,
  eventBanner,
  focusSummary,
  habitsSummary,
  parseRunningPomodoro,
  pomodoroLeft,
  tasksSummary,
  workoutSummary,
} from '../logic/summary';

const LINK = 'inline-flex min-h-11 items-center text-sm font-medium text-indigo-600 dark:text-indigo-400';

function fmtHours(h: number): string {
  return `${h.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}

/** A short hint with a link to the module, shown instead of an empty card. */
function Hint({ to, children, linkText }: { to: string; children: ReactNode; linkText: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      <span>{children}</span>
      <Link to={to} className={`${LINK} shrink-0`}>
        {linkText}
      </Link>
    </div>
  );
}

/** «IELTS через 3 дня · Подготовка» at the very top while an event drives the day. */
export function EventBanner({ targets, today }: { targets: DailyTargets; today: DateKey }) {
  const event = useEvent(targets.activeEventId ?? '');
  if (!targets.activeEventId || targets.phase === 'normal' || !event) return null;
  return (
    <Link
      to={`/today/events/${event.id}`}
      className="mb-3 flex min-h-11 items-center rounded-2xl bg-indigo-600 px-4 py-3 font-medium text-white shadow-sm"
    >
      {eventBanner(event, targets.phase, today)}
    </Link>
  );
}

function TasksCard({ data, targets, today }: { data: SummaryData; targets: DailyTargets; today: DateKey }) {
  const s = tasksSummary(data.tasks, today, targets.focusProjectId);
  if (s.count === 0) {
    return (
      <Hint to="/tasks" linkText="Добавить">
        На сегодня задач нет.
      </Hint>
    );
  }
  return (
    <section aria-label="Задачи на сегодня">
      <Card title="Задачи">
        <p className="mb-2 text-sm">
          Задачи: план {s.plannedMin} / ёмкость {targets.taskCapacityMin} мин
        </p>
        <Progress label="План задач против ёмкости дня" value={s.plannedMin} max={targets.taskCapacityMin} />
        <ol className="mt-3 space-y-1 text-sm">
          {s.top.map((t) => (
            <li key={t.id} className="truncate">
              {t.projectId !== undefined && t.projectId === targets.focusProjectId && (
                <span className="mr-1" role="img" aria-label="Фокус-проект">
                  🎯
                </span>
              )}
              {t.title}
              {t.estimateMin ? <span className="text-zinc-500"> · {t.estimateMin} мин</span> : null}
            </li>
          ))}
        </ol>
        <Link to="/tasks" className={LINK}>
          Все задачи на сегодня ({s.count}) →
        </Link>
      </Card>
    </section>
  );
}

function HabitsCard({ data, today }: { data: SummaryData; today: DateKey }) {
  const s = habitsSummary(data.habits, data.habitLogs, today);
  if (s.total === 0) {
    return (
      <Hint to="/habits" linkText="Настроить">
        На сегодня привычек нет.
      </Hint>
    );
  }
  return (
    <section aria-label="Привычки на сегодня">
      <Card title="Привычки">
        <p className="mb-2 text-sm">
          Привычки: {s.done} из {s.total}
        </p>
        <Progress label="Выполнено привычек" value={s.done} max={s.total} />
        <Link to="/habits" className={LINK}>
          Отметить привычки →
        </Link>
      </Card>
    </section>
  );
}

/** Re-renders every second while `active`; callers read the clock during render, so there is no stale first frame. */
function useTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function FocusCard({ data, targets, today }: { data: SummaryData; targets: DailyTargets; today: DateKey }) {
  const s = focusSummary(data.timeEntries, today);
  const now = Date.now();
  const pomodoro = parseRunningPomodoro(data.pomodoroRunning, now);
  // Ticks only while a phase is really running: a stale key (endsAt passed) stops the timer.
  useTick(pomodoro !== undefined);
  if (targets.focusPomodoros === 0 && !s.running && !pomodoro) {
    return (
      <p className="mb-3 px-1 text-sm text-zinc-500">Сегодня без фокус-сессий — по плану отдых от глубокой работы.</p>
    );
  }
  if (!s.running && !pomodoro && s.sessions === 0) {
    return (
      <Hint to="/time" linkText="Запустить">
        Фокус-сессий сегодня ещё не было.
      </Hint>
    );
  }
  return (
    <section aria-label="Фокус">
      <Card title="Фокус">
        {s.running && (
          <p className="mb-2 text-sm font-medium">
            ⏱ Идёт таймер · {data.categories[s.running.categoryId] ?? 'без категории'}, с{' '}
            {format(s.running.start, 'HH:mm')}
          </p>
        )}
        {pomodoro && (
          <p className="mb-2 text-sm font-medium">
            🍅 Идёт Pomodoro · {POMODORO_PHASE_LABEL[pomodoro.phase]}, осталось {pomodoroLeft(pomodoro.endsAt, now)}
          </p>
        )}
        <p className="mb-2 text-sm">
          Фокус: {s.sessions} из {targets.focusPomodoros}
        </p>
        <Progress label="Фокус-сессии" value={s.sessions} max={targets.focusPomodoros} />
        <Link to="/time" className={LINK}>
          К таймеру →
        </Link>
      </Card>
    </section>
  );
}

function HealthCard({ data, targets }: { data: SummaryData; targets: DailyTargets }) {
  if (data.sleepHours === undefined && data.workouts.length === 0) {
    // Sleep and workouts are separate blocks since #107: one link to each.
    return (
      <div className="mb-3 rounded-2xl border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <p>Сон и тренировки сегодня не записаны.</p>
        <div className="flex gap-4">
          <Link to="/health" className={LINK}>
            Записать сон
          </Link>
          <Link to="/training" className={LINK}>
            Записать тренировку
          </Link>
        </div>
      </div>
    );
  }
  const w = workoutSummary(data.workouts);
  return (
    <section aria-label="Сон и тренировка">
      <Card title="Сон и тренировка">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">Сон</dt>
          <dd>
            {data.sleepHours === undefined ? 'не записан' : fmtHours(data.sleepHours)}
            <span className="text-zinc-500"> · цель {fmtHours(targets.sleepHours)}</span>
          </dd>
          <dt className="text-zinc-500">Тренировка</dt>
          <dd>
            {w ? `${w.types.join(', ')}, ${w.minutes} мин, RPE ${w.maxRpe}` : 'не было'}
            <span className="text-zinc-500"> · предел: {INTENSITY_LABEL[targets.maxWorkoutIntensity]}</span>
          </dd>
        </dl>
        <div className="flex gap-4">
          <Link to="/health" className={LINK}>
            Сон →
          </Link>
          <Link to="/training" className={LINK}>
            Тренировки →
          </Link>
        </div>
      </Card>
    </section>
  );
}

/** Widgets of every block for today. Reads other modules' tables, never writes them. */
export function SummaryCards({ targets, today }: { targets: DailyTargets; today: DateKey }) {
  const data = useSummaryData(today);
  if (!data) return <Card>Загрузка…</Card>;
  return (
    <>
      <TasksCard data={data} targets={targets} today={today} />
      <HabitsCard data={data} today={today} />
      <FocusCard data={data} targets={targets} today={today} />
      <HealthCard data={data} targets={targets} />
    </>
  );
}
