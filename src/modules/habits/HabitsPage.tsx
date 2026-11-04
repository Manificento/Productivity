import { useState } from 'react';
import { todayKey } from '../../core/dates';
import type { Habit } from '../../core/types';
import { Button, Card, Empty, Page, Sheet } from '../../ui';
import { HabitEditor } from './components/HabitEditor';
import { HabitRow } from './components/HabitRow';
import { archiveHabit, createHabit, toggleHabit, updateHabit, useHabitLogs, useHabits } from './data/habitStore';
import { describeSchedule } from './logic/habitForm';
import { todayHabits } from './logic/today';

type Editing = { mode: 'new' } | { mode: 'edit'; habit: Habit } | undefined;

export function HabitsPage() {
  const habits = useHabits();
  const logs = useHabitLogs();
  const [editing, setEditing] = useState<Editing>();
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
  const close = () => setEditing(undefined);

  async function toggle(id: string) {
    try {
      await toggleHabit(id, todayKey());
      setError(undefined);
    } catch {
      setError('Не удалось сохранить отметку. Попробуйте ещё раз');
    }
  }

  return (
    <Page title="Привычки">
      {!hasActive ? (
        <Card>
          <p className="mb-3 text-center text-sm text-zinc-500">
            Привычек пока нет. Добавьте первую — например, зарядку или чтение.
          </p>
        </Card>
      ) : (
        <>
          {items.length > 0 ? (
            <ul aria-label="Привычки на сегодня" className="mb-3 flex flex-col gap-2">
              {items.map((item) => (
                <HabitRow
                  key={item.habit.id}
                  item={item}
                  onToggle={() => void toggle(item.habit.id)}
                  onEdit={() => setEditing({ mode: 'edit', habit: item.habit })}
                />
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
                    <button
                      type="button"
                      onClick={() => setEditing({ mode: 'edit', habit: h })}
                      aria-label={`Изменить «${h.name}»`}
                      className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
                    >
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 text-zinc-500">{describeSchedule(h.schedule)}</span>
                    </button>
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
      <Button className="w-full" onClick={() => setEditing({ mode: 'new' })}>
        + Привычка
      </Button>

      <Sheet
        open={editing !== undefined}
        title={editing?.mode === 'edit' ? 'Изменить привычку' : 'Новая привычка'}
        onClose={close}
      >
        {editing && (
          <HabitEditor
            key={editing.mode === 'edit' ? editing.habit.id : 'new'}
            habit={editing.mode === 'edit' ? editing.habit : undefined}
            onSave={async (fields) => {
              if (editing.mode === 'edit') await updateHabit(editing.habit.id, fields);
              else await createHabit(fields);
              close();
            }}
            onArchive={
              editing.mode === 'edit'
                ? async () => {
                    await archiveHabit(editing.habit.id);
                    close();
                  }
                : undefined
            }
          />
        )}
      </Sheet>
    </Page>
  );
}
