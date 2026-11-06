import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { DailyTargets } from '../../../core/adaptation/types';
import { useDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { fromDateKey, shiftDateKey } from '../../../core/dates';
import type { DateKey, PlannedSession } from '../../../core/types';
import { Card, Chip, Empty } from '../../../ui';
import { useUpcomingSessions } from '../data/programs';
import { dayMark } from '../logic/periodization';

export const OUTLOOK_DAYS = 14;

/** One future day: its session (if any) and the deload / rest mark from that day's targets. */
function PlanDay({ targets, session }: { targets: DailyTargets; session?: PlannedSession }) {
  const mark = dayMark(targets);
  if (!session && !mark) return null;
  const label = format(fromDateKey(targets.date), 'EEEEEE, d MMMM', { locale: ru });
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

/** «План на 2 недели»: upcoming sessions with deload and rest days marked ahead (targets of the 14 days, one query). */
export function PlanOutlook({ today }: { today: DateKey }) {
  const from = shiftDateKey(today, 1);
  const to = shiftDateKey(today, OUTLOOK_DAYS);
  const sessions = useUpcomingSessions(from, to);
  const days = useDailyTargetsRange(from, to);
  if (sessions === undefined || days === undefined) return null;
  return (
    <Card title="План на 2 недели">
      {sessions.length === 0 && <Empty>Тренировок не запланировано</Empty>}
      <ul aria-label="План на 2 недели">
        {days.map((t) => (
          <PlanDay key={t.date} targets={t} session={sessions.find((s) => s.date === t.date)} />
        ))}
      </ul>
    </Card>
  );
}
