import { Link } from 'react-router-dom';
import { todayKey } from '../../core/dates';
import type { DateKey } from '../../core/types';
import { Card, Empty, Page } from '../../ui';
import { NbackChart } from './components/NbackChart';
import { MedianChart } from './components/MedianChart';
import { useRecentPvt } from './data/cognitiveTests';
import { useMindSessions, useNbackSessions } from './data/mindSessions';
import { compareWithAverage, dailyMedians, HISTORY_DAYS } from './logic/history';
import { dailyProgress } from './logic/nback';
import { lastResultText, latestOf } from './logic/summary';

function ComparisonText({ latestMs, averageMs, diffMs }: { latestMs: number; averageMs: number; diffMs: number }) {
  const verdict =
    diffMs === 0
      ? 'как ваше среднее'
      : `на ${Math.abs(diffMs)} мс ${diffMs < 0 ? 'быстрее' : 'медленнее'} вашего среднего`;
  return (
    <p className="mt-3 text-sm">
      Последний результат — <strong className="tabular-nums">{latestMs} мс</strong>, {verdict} (
      <span className="tabular-nums">{averageMs} мс</span>).
    </p>
  );
}

/** `/cognition` — start the test and see the 14-day history. */
export function CognitionHome({ today = todayKey() }: { today?: DateKey }) {
  const tests = useRecentPvt(today);
  const comparison = tests && compareWithAverage(tests);
  const nback = useNbackSessions();
  const stroop = useMindSessions('stroop');
  const schulte = useMindSessions('schulte');
  const lastPvt = tests && latestOf(tests);
  const lastNback = nback && latestOf(nback);
  const lastStroop = stroop && latestOf(stroop);
  const lastSchulte = schulte && latestOf(schulte);
  const exercises = [
    { to: '/cognition/pvt', title: 'PVT', last: lastPvt && `медиана ${lastPvt.medianRtMs} мс` },
    { to: '/cognition/nback', title: 'n-back', last: lastNback && lastResultText('nback', lastNback) },
    { to: '/cognition/stroop', title: 'Струп', last: lastStroop && lastResultText('stroop', lastStroop) },
    { to: '/cognition/schulte', title: 'Шульте', last: lastSchulte && lastResultText('schulte', lastSchulte) },
  ];
  const nbackDays = dailyProgress(nback ?? [], today, HISTORY_DAYS);

  return (
    <Page title="Тест внимания">
      <Card>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Одна минута, чтобы объективно оценить внимание: время реакции, пропуски и фальстарты.
        </p>
        <Link
          to="/cognition/pvt"
          className="flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Пройти тест
        </Link>
      </Card>
      <Card title="История за 14 дней">
        {tests === undefined ? (
          <Empty>Загружаю…</Empty>
        ) : comparison ? (
          <>
            <MedianChart days={dailyMedians(tests, today)} />
            <ComparisonText {...comparison} />
          </>
        ) : (
          <Empty>
            {tests.length === 0
              ? 'Пока нет результатов. Пройдите тест — история появится после двух попыток.'
              : 'Есть один результат. Пройдите тест ещё раз, чтобы увидеть историю.'}
          </Empty>
        )}
      </Card>
      <Card title="Упражнения">
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {exercises.map((x) => (
            <li key={x.to} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link to={x.to} className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  {x.title}
                </Link>
                <p className="truncate text-xs text-zinc-500" data-testid="last-result">
                  {x.last ?? 'Ещё нет результатов'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="История n-back">
        {nback === undefined ? (
          <Empty>Загружаю…</Empty>
        ) : !nbackDays.some((d) => d.level !== undefined) ? (
          <Empty>Пока нет сессий. Пройдите n-back — график уровня и точности появится здесь.</Empty>
        ) : (
          <NbackChart days={nbackDays} />
        )}
      </Card>
    </Page>
  );
}
