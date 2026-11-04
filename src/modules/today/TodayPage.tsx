import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useDailyTargets } from '../../core/adaptation/useDailyTargets';
import type { DailyTargets, Phase } from '../../core/adaptation/types';
import { todayKey } from '../../core/dates';
import type { WorkoutIntensity } from '../../core/types';
import { Card, Page } from '../../ui';
import { EventDetail } from './components/EventDetail';
import { EventsList } from './components/EventsList';

const PHASE_LABEL: Record<Phase, string> = {
  normal: 'Обычный день',
  prep: 'Подготовка',
  taper: 'Разгрузка перед событием',
  event: 'День события',
  recovery: 'Восстановление',
};

const INTENSITY_LABEL: Record<WorkoutIntensity, string> = {
  rest: 'отдых',
  light: 'лёгкая',
  moderate: 'умеренная',
  hard: 'любая',
};

function hours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function TargetsCard({ t }: { t: DailyTargets }) {
  const rows: [string, string][] = [
    ['Задачи', hours(t.taskCapacityMin)],
    ['Фокус-сессии', String(t.focusPomodoros)],
    ['Сон', `${t.sleepHours} ч, отбой ${t.bedtime}`],
    ['Тренировка', INTENSITY_LABEL[t.maxWorkoutIntensity]],
    ['Медитация', `${t.meditationMin} мин`],
    ['Кофеин', `до ${t.caffeineCutoff}${t.noNewFoods ? ', без новых продуктов' : ''}`],
  ];
  return (
    <Card title={`Цели дня · ${PHASE_LABEL[t.phase]}`}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-500">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {t.reasons.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {t.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TodayHome() {
  const targets = useDailyTargets(todayKey());
  return (
    <Page title="Сегодня">
      {targets ? <TargetsCard t={targets} /> : <Card>Загрузка…</Card>}
      <Link
        to="/today/events"
        className="flex min-h-11 items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <span>
          <span aria-hidden>📅</span> События
        </span>
        <span aria-hidden className="text-zinc-400">
          →
        </span>
      </Link>
    </Page>
  );
}

/**
 * "Today" module: the daily targets screen and important events.
 * Sub-routes live under /today/… because the module itself is mounted at the app root.
 */
export function TodayPage() {
  return (
    <Routes>
      <Route index element={<TodayHome />} />
      <Route path="today/events" element={<EventsList />} />
      <Route path="today/events/:id" element={<EventDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
