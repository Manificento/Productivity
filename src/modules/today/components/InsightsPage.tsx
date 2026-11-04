import { Link } from 'react-router-dom';
import { todayKey } from '../../../core/dates';
import { Card, Page } from '../../../ui';
import { INSIGHT_WINDOW_DAYS, useInsightInput } from '../data/insights';
import { pluralDays } from '../logic/events';
import { buildInsights, describeCorrelation, MIN_POINTS, type Insight } from '../logic/insights';
import { ScatterPlot } from './ScatterPlot';

const CAVEAT = 'Это связь, а не причина: на оба показателя могут влиять другие факторы.';

function fmtR(r: number): string {
  return r.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function InsightCard({ insight }: { insight: Insight }) {
  const n = insight.points.length;
  let body;
  if (insight.missing > 0) {
    body = (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Мало данных — нужно ещё {insight.missing} {pluralDays(insight.missing)}. Сейчас {n} из {MIN_POINTS}.
      </p>
    );
  } else if (insight.r === undefined) {
    body = (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Значения не меняются день ото дня — вывода пока нет.</p>
    );
  } else {
    body = (
      <>
        <p className="mb-2 text-sm font-medium">
          {describeCorrelation(insight.r)}: r = {fmtR(insight.r)}{' '}
          <span className="font-normal text-zinc-500">
            ({n} {pluralDays(n)})
          </span>
        </p>
        <ScatterPlot
          points={insight.points}
          xLabel={insight.xLabel}
          yLabel={insight.yLabel}
          label={`Диаграмма рассеяния «${insight.title}»: ${n} ${pluralDays(n)}, r = ${fmtR(insight.r)}`}
        />
        <p className="mt-2 text-xs text-zinc-500">{CAVEAT}</p>
      </>
    );
  }
  return (
    <section aria-label={insight.title}>
      <Card title={insight.title}>{body}</Card>
    </section>
  );
}

/** «Инсайты»: correlations between sleep, tasks, focus, workouts and energy. */
export function InsightsPage() {
  const today = todayKey();
  const input = useInsightInput(today);
  return (
    <Page title="Инсайты">
      <Link to="/" className="mb-3 inline-flex min-h-11 items-center text-sm text-indigo-600 dark:text-indigo-400">
        ← Сегодня
      </Link>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Связи за последние {INSIGHT_WINDOW_DAYS} дней. Коэффициент Пирсона r: от −1 до 1, чем дальше от нуля, тем теснее
        связь.
      </p>
      {input ? buildInsights(input, today).map((i) => <InsightCard key={i.id} insight={i} />) : <Card>Загрузка…</Card>}
    </Page>
  );
}
