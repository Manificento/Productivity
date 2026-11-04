import { useState } from 'react';
import { Button, Card } from '../../../ui';
import { describeSchedule } from '../logic/habitForm';
import { pickStarter, STARTER_HABITS } from '../logic/starter';
import type { HabitFields } from '../logic/habitForm';

/** Empty-screen offer: tick the habits to start with, then «Добавить». Nothing is created before that. */
export function StarterHabits({ onAdd }: { onAdd: (habits: HabitFields[]) => Promise<void> }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  function flip(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function add() {
    setSaving(true);
    try {
      await onAdd(pickStarter(picked));
    } catch {
      setError('Не удалось сохранить. Попробуйте ещё раз');
      setSaving(false);
    }
  }

  return (
    <Card title="Начать с готового набора">
      <fieldset>
        <legend className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
          Отметьте привычки, с которых хотите начать.
        </legend>
        <ul className="mb-3 flex flex-col">
          {STARTER_HABITS.map((h) => (
            <li key={h.name}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-indigo-600"
                  checked={picked.has(h.name)}
                  onChange={() => flip(h.name)}
                />
                <span className="flex-1">{h.name}</span>
                <span className="text-xs text-zinc-500">{describeSchedule(h.schedule)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {error && (
        <p role="alert" className="mb-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={picked.size === 0 || saving} onClick={() => void add()}>
        {picked.size > 0 ? `Добавить (${picked.size})` : 'Добавить'}
      </Button>
    </Card>
  );
}
