import { todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Card, Empty } from '../../../ui';
import { AlarmCard } from './AlarmCard';
import { SleepChart } from './SleepChart';
import { SleepForm } from './SleepForm';
import { SleepGoal } from './SleepGoal';
import { useRecentSleep } from '../data/sleep';
import { averageHours, formatHours, sleepChart } from '../logic/sleep';

/** «Сон»: log last night and see the last 14 days. */
export function SleepTab({ today = todayKey() }: { today?: DateKey }) {
  const logs = useRecentSleep(today);
  const average = logs && averageHours(logs, today, 7);

  return (
    <>
      <SleepGoal today={today} lastNight={logs?.find((l) => l.date === today)} />
      <AlarmCard today={today} recordFor={(day) => logs?.find((l) => l.date === day)} />
      {/* Re-mount after midnight so the form defaults to the new «last night». */}
      <SleepForm key={today} today={today} recordFor={(day) => logs?.find((l) => l.date === day)} />
      <Card title="Сон за 14 дней">
        {logs === undefined ? (
          <Empty>Загрузка…</Empty>
        ) : logs.length === 0 ? (
          <Empty>Записей пока нет — сохраните прошлую ночь</Empty>
        ) : (
          <>
            <SleepChart bars={sleepChart(logs, today)} average={average} />
            <p className="mt-3 text-sm">
              Среднее за 7 дней: <strong>{average === undefined ? 'нет записей' : formatHours(average)}</strong>
            </p>
          </>
        )}
      </Card>
    </>
  );
}
