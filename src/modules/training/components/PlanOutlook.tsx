import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { fromDateKey, shiftDateKey } from '../../../core/dates';
import type { DateKey, PlannedSession } from '../../../core/types';
import { Card, Chip, Empty } from '../../../ui';
import { useUpcomingSessions } from '../data/programs';
import { dayMark } from '../logic/periodization';

export const OUTLOOK_DAYS = 14;

/** One future day: its session (if any) and the deload / rest mark from that day's targets. */
function PlanDay({ date, session }: { date: DateKey; session?: PlannedSession }) {
  const targets = useDailyTargets(date);
  const mark = targets && dayMark(targets);
  if (!session && !mark) return null;
  const label = format(fromDateKey(date), 'EEEEEE, d MMMM', { locale: ru });
  return (
    <li
      aria-label={label}
      className="flex items-center justify-between gap-2 border-b border-zinc-200 py-2 last:border-0 dark:border-zinc-800"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-zinc-500">
          {session ? session.exercises.map((e) => e.name).join(', ') : 'Без тренировки'}
        </p>
      </div>
      {mark === 'rest' && <Chip tone="warning">День отдыха</Chip>}
      {mark === 'deload' && <Chip tone="accent">Разгрузка</Chip>}
    </li>
  );
}

/** «План на 2 недели»: upcoming sessions with deload and rest days marked ahead (targets of each future date). */
export function PlanOutlook({ today }: { today: DateKey }) {
  const from = shiftDateKey(today, 1);
  const sessions = useUpcomingSessions(from, shiftDateKey(today, OUTLOOK_DAYS));
  if (sessions === undefined) return null;
  const dates = Array.from({ length: OUTLOOK_DAYS }, (_, i) => shiftDateKey(from, i));
  return (
    <Card title="План на 2 недели">
      {sessions.length === 0 && <Empty>Тренировок не запланировано</Empty>}
      <ul aria-label="План на 2 недели">
        {dates.map((d) => (
          <PlanDay key={d} date={d} session={sessions.find((s) => s.date === d)} />
        ))}
      </ul>
    </Card>
  );
}
