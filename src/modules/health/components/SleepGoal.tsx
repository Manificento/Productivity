import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { sleepHours } from '../../../core/logging/sleepTime';
import type { DateKey, SleepLog } from '../../../core/types';
import { Card } from '../../../ui';
import { formatHoursDiff } from '../logic/adaptation';
import { formatHours } from '../logic/sleep';

/** Today's sleep goal from the adaptation layer and how last night compares with it. */
export function SleepGoal({ today, lastNight }: { today: DateKey; lastNight?: SleepLog }) {
  const targets = useDailyTargets(today);
  if (!targets) return null;
  const slept = lastNight && sleepHours(lastNight);
  const diff = slept === undefined ? undefined : slept - targets.sleepHours;

  return (
    <Card title="Цель сна">
      <p className="text-sm">
        <strong>{formatHours(targets.sleepHours)}</strong>, отбой в <strong>{targets.bedtime}</strong>
      </p>
      {slept !== undefined && diff !== undefined && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Прошлая ночь: {formatHours(slept)}{' '}
          <span
            className={`font-semibold ${diff < -0.05 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}
          >
            ({formatHoursDiff(diff)})
          </span>
        </p>
      )}
      {targets.reasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-zinc-500">
          {targets.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
