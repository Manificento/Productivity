import { useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useDailyTargets } from '../../core/adaptation/useDailyTargets';
import type { DailyTargets, Phase } from '../../core/adaptation/types';
import { todayKey } from '../../core/dates';
import { Card, Page } from '../../ui';
import { MorningCard } from './components/MorningCard';
import { BaselineEditor } from './components/BaselineEditor';
import { EventDetail } from './components/EventDetail';
import { EventsList } from './components/EventsList';
import { InsightsPage } from './components/InsightsPage';
import { Onboarding } from './components/Onboarding';
import { useNeedsOnboarding } from './data/onboarding';
import { EventBanner, SummaryCards } from './components/SummaryCards';
import { INTENSITY_LABEL } from './logic/baseline';

const PHASE_LABEL: Record<Phase, string> = {
  normal: 'Обычный день',
  prep: 'Подготовка',
  taper: 'Разгрузка перед событием',
  event: 'День события',
  recovery: 'Восстановление',
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

function NavRow({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span>
        <span aria-hidden>{icon}</span> {label}
      </span>
      <span aria-hidden className="text-zinc-400">
        →
      </span>
    </Link>
  );
}

function TodayHome() {
  const today = todayKey();
  const targets = useDailyTargets(today);
  return (
    <Page title="Сегодня">
      {targets && <EventBanner targets={targets} today={today} />}
      <MorningCard key={today} today={today} />
      {targets ? (
        <>
          <TargetsCard t={targets} />
          <SummaryCards targets={targets} today={today} />
        </>
      ) : (
        <Card>Загрузка…</Card>
      )}
      <nav aria-label="Настройки дня" className="space-y-2">
        <NavRow to="/today/events" icon="📅" label="События" />
        <NavRow to="/today/baseline" icon="⚖️" label="Базовый режим" />
        <NavRow to="/today/insights" icon="📈" label="Инсайты" />
      </nav>
    </Page>
  );
}

/**
 * `/`: onboarding on the first run, otherwise «Сегодня». The first answer is kept while this screen is mounted, so
 * creating the event during onboarding does not swap the screen before the plan is shown.
 */
function TodayIndex() {
  const needs = useNeedsOnboarding();
  const [first, setFirst] = useState<boolean>();
  const [closed, setClosed] = useState(false);
  if (first === undefined && needs !== undefined) setFirst(needs);
  // A few milliseconds: render nothing rather than flash «Сегодня» before the onboarding.
  if (first === undefined) return null;
  return first && !closed ? <Onboarding onDone={() => setClosed(true)} /> : <TodayHome />;
}

/**
 * "Today" module: the daily targets screen and important events.
 * Sub-routes live under /today/… because the module itself is mounted at the app root.
 */
export function TodayPage() {
  return (
    <Routes>
      <Route index element={<TodayIndex />} />
      <Route path="today/events" element={<EventsList />} />
      <Route path="today/events/:id" element={<EventDetail />} />
      <Route path="today/baseline" element={<BaselineEditor />} />
      <Route path="today/insights" element={<InsightsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
