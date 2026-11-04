import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Baseline, Phase } from '../../../core/adaptation/types';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, LifeEvent, MeditationKind, WorkoutIntensity } from '../../../core/types';
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

const PHASE_FULL: Record<Phase, string> = {
  normal: 'обычный день',
  prep: 'подготовка',
  taper: 'разгрузка',
  event: 'день события',
  recovery: 'восстановление',
};

const INTENSITY_FULL: Record<WorkoutIntensity, string> = {
  rest: 'отдых',
  light: 'лёгкая',
  moderate: 'умеренная',
  hard: 'любая',
};

const MEDITATION_SHORT: Record<MeditationKind, string> = {
  breathing: 'дыхание',
  focus: 'фокус',
  sleep: 'сон',
  body: 'тело',
};

/** «Как изменятся следующие 10 дней» — targets per day with one (possibly unsaved) event among the others. */
export function PlanPreview({
  event,
  others,
  baseline,
  today,
}: {
  event: LifeEvent;
  others: LifeEvent[];
  baseline: Baseline;
  today: DateKey;
}) {
  const rows = previewDays(event, others, baseline, today);
  if (rows.every((r) => r.phase === 'normal')) {
    return <p className="text-sm text-zinc-500">Ближайшие 10 дней идут в обычном режиме.</p>;
  }
  return (
    <>
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
                <abbr title="Тренировка" className="no-underline">
                  Трен.
                </abbr>
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
                <td className="px-1 py-1.5">
                  <abbr title={PHASE_FULL[r.phase]} className="no-underline">
                    {PHASE_SHORT[r.phase]}
                  </abbr>
                </td>
                <td className="whitespace-nowrap px-1 py-1.5">{formatCapacity(r.taskCapacityMin)}</td>
                <td className="whitespace-nowrap px-1 py-1.5">
                  {r.sleepHours.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч
                </td>
                <td className="px-1 py-1.5">
                  <abbr title={INTENSITY_FULL[r.maxWorkoutIntensity]} className="no-underline">
                    {INTENSITY_SHORT[r.maxWorkoutIntensity]}
                  </abbr>
                </td>
                <td className="px-1 py-1.5">{r.focusPomodoros}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Second table: v2 targets, so six columns above still fit a 360 px screen. */}
      <div className="-mx-1 mt-3 overflow-x-auto">
        <table aria-label="Восстановление на 10 дней" className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-zinc-500">
              <th scope="col" className="px-1 py-1 font-medium">
                День
              </th>
              <th scope="col" className="px-1 py-1 font-medium">
                <abbr title="Медитация" className="no-underline">
                  Медит.
                </abbr>
              </th>
              <th scope="col" className="px-1 py-1 font-medium">
                <abbr title="Тренажёры ума" className="no-underline">
                  Ум
                </abbr>
              </th>
              <th scope="col" className="px-1 py-1 font-medium">
                Привычки
              </th>
              <th scope="col" className="px-1 py-1 font-medium">
                <abbr title="Разгрузочный день тренировок" className="no-underline">
                  Разгр.
                </abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className={`border-t border-zinc-200 dark:border-zinc-800 ${PHASE_ROW[r.phase]}`}>
                <th scope="row" className="whitespace-nowrap px-1 py-1.5 text-left font-medium">
                  {format(fromDateKey(r.date), 'd MMM', { locale: ru })}
                </th>
                <td className="px-1 py-1.5">{MEDITATION_SHORT[r.meditationKind]}</td>
                <td className="whitespace-nowrap px-1 py-1.5">{r.mindTrainingMin} мин</td>
                <td className="px-1 py-1.5">{r.habitsMode === 'essential' ? 'ключевые' : 'все'}</td>
                <td className="px-1 py-1.5">{r.deload ? 'да' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
