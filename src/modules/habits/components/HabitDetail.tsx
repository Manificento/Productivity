import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fromDateKey, todayKey } from '../../../core/dates';
import type { DateKey } from '../../../core/types';
import { Button, Card, Empty, Page, Sheet } from '../../../ui';
import { archiveHabit, toggleHabit, updateHabit, useHabitLogs, useHabits } from '../data/habitStore';
import { calendarGrid, cellStatusLabel, habitHistory, habitStats, textOn, type CellStatus } from '../logic/calendar';
import { describeSchedule, WEEKDAYS } from '../logic/habitForm';
import { HabitEditor } from './HabitEditor';

const BACK = (
  <Link to="/habits" className="mb-3 inline-flex min-h-11 items-center text-sm text-indigo-600 dark:text-indigo-400">
    ← Все привычки
  </Link>
);

function cellClass(
  status: CellStatus,
  color: string,
): { className: string; style?: { backgroundColor: string; color: string } } {
  const base = 'flex min-h-11 w-full min-w-11 flex-col items-center justify-center rounded-xl text-xs font-medium';
  switch (status) {
    case 'done':
      return { className: base, style: { backgroundColor: color, color: textOn(color) } };
    case 'missed':
      return { className: `${base} border-2 border-rose-300 text-rose-600 dark:border-rose-800 dark:text-rose-400` };
    case 'open':
      return { className: `${base} border-2 border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300` };
    case 'off':
      return { className: `${base} bg-zinc-100 text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-600` };
    case 'future':
      return { className: `${base} text-zinc-300 dark:text-zinc-700` };
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** One habit: 5-week Mon–Sun calendar (tap a past day to flip its mark) and statistics. */
export function HabitDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const habits = useHabits();
  const logs = useHabitLogs();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const today = todayKey();

  if (habits === undefined || logs === undefined) {
    return (
      <Page title="Привычка">
        <Empty>Загрузка…</Empty>
      </Page>
    );
  }

  const habit = habits.find((h) => h.id === id);
  if (!habit || habit.archived) {
    return (
      <Page title="Привычка">
        {BACK}
        <Empty>Привычка не найдена — возможно, она в архиве.</Empty>
      </Page>
    );
  }

  const history = habitHistory(habit, logs);
  const stats = habitStats(history, today);
  const grid = calendarGrid(history, today);
  const color = habit.color ?? '#6366f1';
  const unit = stats.streak.unit === 'weeks' ? ' нед.' : '';

  async function toggle(day: DateKey) {
    try {
      await toggleHabit(habit!.id, day);
      setError(undefined);
    } catch {
      setError('Не удалось сохранить отметку. Попробуйте ещё раз');
    }
  }

  return (
    <Page title={habit.name}>
      {BACK}
      <p className="mb-3 text-sm text-zinc-500">{describeSchedule(habit.schedule)}</p>

      <Card title="Статистика">
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Серия сейчас" value={`🔥${stats.streak.current}${unit}`} />
          <Stat label="Лучшая серия" value={`${stats.streak.best}${unit}`} />
          <Stat label="За 7 дней" value={`${stats.rate7}%`} />
          <Stat label="За 30 дней" value={`${stats.rate30}%`} />
        </dl>
      </Card>

      {/* Outside a Card: seven ≥ 44 px columns only fit the full 328 px content width at 360 px. */}
      <section aria-labelledby="habit-calendar" className="mb-3">
        <h2 id="habit-calendar" className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          5 недель
        </h2>
        <table className="w-full table-fixed border-separate border-spacing-0.5" aria-label="Календарь за 5 недель">
          <thead>
            <tr>
              {WEEKDAYS.map((w) => (
                <th key={w.day} scope="col" className="text-xs font-medium text-zinc-500">
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row[0]!.date}>
                {row.map((cell) => {
                  const look = cellClass(cell.status, color);
                  const label = `${format(fromDateKey(cell.date), 'd MMMM', { locale: ru })}: ${cellStatusLabel(cell.status)}`;
                  return (
                    <td key={cell.date} className="p-0">
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={cell.status === 'done'}
                        disabled={cell.status === 'future'}
                        onClick={() => void toggle(cell.date)}
                        className={look.className}
                        style={look.style}
                      >
                        <span>{fromDateKey(cell.date).getDate()}</span>
                        {fromDateKey(cell.date).getDate() === 1 && (
                          <span aria-hidden="true" className="text-[10px] leading-none">
                            {format(fromDateKey(cell.date), 'LLL', { locale: ru })}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-zinc-500">Нажмите на прошедший день, чтобы поставить или снять отметку.</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </section>

      <Button variant="secondary" className="w-full" onClick={() => setEditing(true)}>
        Изменить
      </Button>

      <Sheet open={editing} title="Изменить привычку" onClose={() => setEditing(false)}>
        {editing && (
          <HabitEditor
            habit={habit}
            onSave={async (fields) => {
              await updateHabit(habit.id, fields);
              setEditing(false);
            }}
            onArchive={async () => {
              await archiveHabit(habit.id);
              setEditing(false);
              navigate('/habits');
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}
