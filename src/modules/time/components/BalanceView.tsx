import { Link } from 'react-router-dom';
import { todayKey } from '../../../core/dates';
import { Card, Empty } from '../../../ui';
import { useAllCategories, useEntriesSince } from '../data/timeStore';
import { balance, formatHoursMinutes, weekStartMs } from '../logic/balance';
import { BarList } from './BarList';
import { useNow } from './useNow';

const WEEK = 7 * 24 * 3_600_000;

/** Where the time went today and this week, compared with the same days of last week. */
export function BalanceView() {
  const now = useNow(30_000);
  const day = todayKey(new Date(now));
  const entries = useEntriesSince(weekStartMs(day) - WEEK);
  const categories = useAllCategories();

  if (entries === undefined || categories === undefined) return <Empty>Загрузка…</Empty>;

  const b = balance(entries, categories, day, now);

  if (b.week.length === 0) {
    return (
      <Card>
        <p className="mb-3 text-center text-sm text-zinc-500">
          За эту и прошлую неделю записей нет. Запустите таймер — и здесь появится баланс.
        </p>
        <Link
          to="/time"
          className="flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Открыть таймер
        </Link>
      </Card>
    );
  }

  return (
    <>
      <Card title={`Сегодня · ${formatHoursMinutes(b.dayTotal)}`}>
        {b.day.length > 0 ? (
          <BarList label="Сегодня по категориям" rows={b.day} showDelta={false} />
        ) : (
          <p className="text-sm text-zinc-500">Сегодня записей пока нет.</p>
        )}
      </Card>
      <Card title={`Неделя · ${formatHoursMinutes(b.weekTotal)}`}>
        <BarList label="Неделя по категориям" rows={b.week} showDelta={b.hasPreviousWeek} />
        {b.hasPreviousWeek && <p className="mt-3 text-xs text-zinc-500">Изменение — к тем же дням прошлой недели.</p>}
      </Card>
    </>
  );
}
