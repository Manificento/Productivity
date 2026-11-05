import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fromDateKey } from '../../../core/dates';
import type { DateKey, MeditationSession } from '../../../core/types';
import { Empty } from '../../../ui';
import { lastWeek, streak } from '../logic/stats';

export function History({ sessions, today }: { sessions: readonly MeditationSession[]; today: DateKey }) {
  if (sessions.length === 0) return <Empty>Пока нет сессий. Начните первую — она появится здесь.</Empty>;
  const week = lastWeek(sessions, today);
  const max = Math.max(1, ...week.map((d) => d.minutes));
  const days = streak(sessions, today);
  return (
    <div className="flex flex-col gap-3">
      <p>
        Серия: <strong data-testid="streak">{days}</strong> дн. подряд
      </p>
      <ul className="flex flex-col gap-1" aria-label="Минуты по дням">
        {week.map((d) => (
          <li key={d.date} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-zinc-500 dark:text-zinc-400">
              {format(fromDateKey(d.date), 'EEEEEE, d MMM', { locale: ru })}
            </span>
            <span className="h-2 rounded bg-indigo-500" style={{ width: `${(d.minutes / max) * 50}%` }} />
            <span>{d.minutes} мин</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Прерванные сессии за всё время: {sessions.filter((s) => !s.completed).length}
      </p>
    </div>
  );
}
