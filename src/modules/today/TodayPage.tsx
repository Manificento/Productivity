import { useDailyTargets } from '../../core/adaptation/useDailyTargets';
import type { DailyTargets, Phase } from '../../core/adaptation/types';
import { todayKey } from '../../core/dates';
import type { WorkoutIntensity } from '../../core/types';
import { Card, Page } from '../../ui';

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

/**
 * Minimal "Today" screen: shows the adaptation targets.
 * The adaptation session extends it with tasks, habits, timer and check-in widgets.
 */
export function TodayPage() {
  const targets = useDailyTargets(todayKey());
  return <Page title="Сегодня">{targets ? <TargetsCard t={targets} /> : <Card>Загрузка…</Card>}</Page>;
}
