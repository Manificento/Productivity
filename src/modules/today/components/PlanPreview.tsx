import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Baseline, Phase } from '../../../core/adaptation/types';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, LifeEvent, WorkoutIntensity } from '../../../core/types';
import { formatCapacity, previewDays } from '../logic/preview';

// Short labels so six columns fit a 360 px screen.
const PHASE_SHORT: Record<Phase, string> = {
  normal: 'обычный',
  prep: 'подгот.',
  taper: 'разгруз.',
  event: 'событие',
  recovery: 'восстан.',
};

const INTENSITY_SHORT: Record<WorkoutIntensity, string> = {
  rest: 'отдых',
  light: 'лёгкая',
  moderate: 'умер.',
  hard: 'любая',
};

const PHASE_ROW: Record<Phase, string> = {
  normal: '',
  prep: 'bg-indigo-50/60 dark:bg-indigo-950/40',
  taper: 'bg-amber-50 dark:bg-amber-950/40',
  event: 'bg-rose-50 font-semibold dark:bg-rose-950/40',
  recovery: 'bg-emerald-50 dark:bg-emerald-950/40',
};

/** «Как изменятся следующие 10 дней» — targets per day for one (possibly unsaved) event. */
export function PlanPreview({ event, baseline, today }: { event: LifeEvent; baseline: Baseline; today: DateKey }) {
  const rows = previewDays(event, baseline, today);
  return (
    <div className="-mx-1 overflow-x-auto">
      <table aria-label="План на 10 дней" className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-zinc-500">
            <th scope="col" className="px-1 py-1 font-medium">
              День
            </th>
            <th scope="col" className="px-1 py-1 font-medium">
              Фаза
            </th>
            <th scope="col" className="px-1 py-1 font-medium">
              Задачи
            </th>
            <th scope="col" className="px-1 py-1 font-medium">
              Сон
            </th>
            <th scope="col" className="px-1 py-1 font-medium">
              Трен.
            </th>
            <th scope="col" className="px-1 py-1 font-medium">
              Фокус
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className={`border-t border-zinc-200 dark:border-zinc-800 ${PHASE_ROW[r.phase]}`}>
              <th scope="row" className="whitespace-nowrap px-1 py-1.5 text-left font-medium">
                {format(fromDateKey(r.date), 'd MMM', { locale: ru })}
              </th>
              <td className="px-1 py-1.5">{PHASE_SHORT[r.phase]}</td>
              <td className="whitespace-nowrap px-1 py-1.5">{formatCapacity(r.taskCapacityMin)}</td>
              <td className="whitespace-nowrap px-1 py-1.5">
                {r.sleepHours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч
              </td>
              <td className="px-1 py-1.5">{INTENSITY_SHORT[r.maxWorkoutIntensity]}</td>
              <td className="px-1 py-1.5">{r.focusPomodoros}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
