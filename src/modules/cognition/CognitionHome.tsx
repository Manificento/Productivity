import { Link } from 'react-router-dom';
import { todayKey } from '../../core/dates';
import type { DateKey } from '../../core/types';
import { Card, Empty, Page } from '../../ui';
import { MedianChart } from './components/MedianChart';
import { useRecentPvt } from './data/cognitiveTests';
import { compareWithAverage, dailyMedians } from './logic/history';

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
    </Page>
  );
}
