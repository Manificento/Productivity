import { useState } from 'react';
import { Link } from 'react-router-dom';
import { todayKey } from '../../../core/dates';
import { Button, Card, Empty, Page, Sheet } from '../../../ui';
import { HabitEditor } from './HabitEditor';
import { HabitRow } from './HabitRow';
import { StarterHabits } from './StarterHabits';
import { createHabit, createHabits, toggleHabit, useHabitLogs, useHabits } from '../data/habitStore';
import { describeSchedule } from '../logic/habitForm';
import { todayHabits } from '../logic/today';

/** Today's habits with one-tap marks; habits not planned today are listed below. */
export function HabitsList() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();
  const today = todayKey();

  if (habits === undefined || logs === undefined) {
    return (
      <Page title="Привычки">
        <Empty>Загрузка…</Empty>
      </Page>
    );
  }

  const { items, other } = todayHabits(habits, logs, today);
  const hasActive = items.length + other.length > 0;
  const close = () => setCreating(false);

  // The day on screen, not the clock at tap time: a page left open past midnight marks what it shows.
  async function toggle(id: string) {
    try {
      await toggleHabit(id, today);
      setError(undefined);
    } catch {
      setError('Не удалось сохранить отметку. Попробуйте ещё раз');
    }
  }

  return (
    <Page title="Привычки">
      {!hasActive ? (
        <>
          <p className="mb-3 text-center text-sm text-zinc-500">
            Привычек пока нет. Выберите из набора ниже или создайте свою.
          </p>
          <StarterHabits onAdd={(list) => createHabits(list)} />
        </>
      ) : (
        <>
          {items.length > 0 ? (
            <ul aria-label="Привычки на сегодня" className="mb-3 flex flex-col gap-2">
              {items.map((item) => (
                <HabitRow key={item.habit.id} item={item} onToggle={() => void toggle(item.habit.id)} />
              ))}
            </ul>
          ) : (
            <Empty>На сегодня привычек нет.</Empty>
          )}
          {other.length > 0 && (
            <Card title="Не сегодня">
              <ul className="flex flex-col">
                {other.map((h) => (
                  <li key={h.id}>
                    <Link
                      to={`/habits/${h.id}`}
                      aria-label={`Открыть «${h.name}»`}
                      className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
                    >
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 text-zinc-500">{describeSchedule(h.schedule)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mb-3 text-center text-sm text-rose-600">
          {error}
        </p>
      )}
      <Button className="w-full" onClick={() => setCreating(true)}>
        + Привычка
      </Button>

      <Sheet open={creating} title="Новая привычка" onClose={close}>
        {creating && (
          <HabitEditor
            onSave={async (fields) => {
              await createHabit(fields);
              close();
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}
