import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey } from '../../../core/dates';
import { sleepHours } from '../../../core/logging/sleepTime';
import type { DateKey, SleepLog } from '../../../core/types';
import { Card } from '../../../ui';
import { formatHoursDiff } from '../logic/adaptation';
import { formatHours } from '../logic/sleep';

/**
 * Tonight's sleep goal from the adaptation layer, and how last night compared with ITS goal.
 * Targets of day D describe the night after D (e.g. «отбой раньше» before an exam), so last night
 * (the record dated today) is measured against yesterday's targets.
 */
export function SleepGoal({ today, lastNight }: { today: DateKey; lastNight?: SleepLog }) {
  const tonight = useDailyTargets(today);
  const yesterday = useDailyTargets(shiftDateKey(today, -1));
  if (!tonight) return null;
  const slept = lastNight && sleepHours(lastNight);
  const lastGoal = yesterday?.sleepHours;
  const diff = slept === undefined || lastGoal === undefined ? undefined : slept - lastGoal;

  return (
    <section aria-label="Цель сна">
      <Card title="Цель сна">
        <p className="text-sm">
          Сегодня: <strong>{formatHours(tonight.sleepHours)}</strong>, отбой в <strong>{tonight.bedtime}</strong>
        </p>
        {slept !== undefined && diff !== undefined && lastGoal !== undefined && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Прошлая ночь: {formatHours(slept)}{' '}
            <span
              className={`font-semibold ${diff < -0.05 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              ({formatHoursDiff(diff)})
            </span>
            {lastGoal !== tonight.sleepHours && <> при цели {formatHours(lastGoal)}</>}
          </p>
        )}
      </Card>
    </section>
  );
}
