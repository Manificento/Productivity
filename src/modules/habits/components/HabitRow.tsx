import type { TodayHabit } from '../logic/today';
import { streakLabel } from '../logic/today';
import { describeSchedule } from '../logic/habitForm';

export function HabitRow({ item, onToggle, onEdit }: { item: TodayHabit; onToggle: () => void; onEdit: () => void }) {
  const { habit, done } = item;
  const color = habit.color ?? '#6366f1';
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? `Снять отметку «${habit.name}»` : `Отметить «${habit.name}»`}
        onClick={onToggle}
        className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl font-bold text-white transition"
        style={done ? { backgroundColor: color, borderColor: color } : { borderColor: color }}
      >
        {done ? '✓' : ''}
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Изменить «${habit.name}»`}
        className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left"
      >
        <span className={`truncate font-medium ${done ? 'text-zinc-500 line-through' : ''}`}>{habit.name}</span>
        <span className="text-xs text-zinc-500">{describeSchedule(habit.schedule)}</span>
      </button>
      <span className="shrink-0 text-sm font-semibold tabular-nums" aria-label={`Серия: ${item.streak.current}`}>
        {streakLabel(item.streak)}
      </span>
    </li>
  );
}
