import { todayKey } from '../../core/dates';
import { Card, Empty, Page } from '../../ui';
import { useXpSources } from './data/sources';
import { XP_HINTS, summarize } from './logic/xp';

/** `/progress` — level and experience over all blocks, computed from their tables. */
export function ProgressPage() {
  const sources = useXpSources();
  if (!sources)
    return (
      <Page title="Прогресс">
        <Card>
          <Empty>Загрузка…</Empty>
        </Card>
      </Page>
    );
  const s = summarize(sources, todayKey());
  const pct = Math.round((s.into / s.needed) * 100);
  return (
    <Page title="Прогресс">
      <Card>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Уровень</p>
        <p className="text-4xl font-bold" data-testid="level">
          {s.level}
        </p>
        <div
          role="progressbar"
          aria-label="Прогресс до следующего уровня"
          aria-valuemin={0}
          aria-valuemax={s.needed}
          aria-valuenow={s.into}
          className="mt-2 h-3 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700"
        >
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm" data-testid="level-progress">
          {s.into} / {s.needed} XP до уровня {s.level + 1}
        </p>
      </Card>
      <Card>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Сегодня</dt>
            <dd className="text-lg font-semibold" data-testid="xp-today">
              {s.today} XP
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">За неделю</dt>
            <dd className="text-lg font-semibold" data-testid="xp-week">
              {s.week} XP
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Всего</dt>
            <dd className="text-lg font-semibold" data-testid="xp-total">
              {s.total} XP
            </dd>
          </div>
        </dl>
      </Card>
      {s.total === 0 && (
        <Card>
          <Empty>Пока нет опыта. Он начисляется за:</Empty>
          <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="Что даёт опыт">
            {XP_HINTS.map((h) => (
              <li key={h.label} className="flex justify-between">
                <span>{h.label}</span>
                <span className="text-zinc-500 dark:text-zinc-400">+{h.xp} XP</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
