import { useState } from 'react';
import { Button, Card, Empty, Sheet } from '../../../ui';
import type { TimeCategory } from '../../../core/types';
import { CategoryButtons } from './CategoryButtons';
import { ManualEntryForm } from './ManualEntryForm';
import { RunningTimer } from './RunningTimer';
import {
  addManualEntry,
  createDefaultCategories,
  startCategoryTimer,
  stopTimer,
  useCategories,
  useRunningEntry,
} from '../data/timeStore';
import { DEFAULT_CATEGORY_NAMES } from '../logic/timer';

/** A Pomodoro phase running at the same time (see `TimePage`). */
export interface RunningFocus {
  /** 'фокус' or 'перерыв'. */
  phase: string;
  left: string;
  /** Resolves to `false` when it could not be stopped. */
  stop: () => Promise<boolean>;
}

/** Stopwatch tracking: starter categories, one-tap timer, manual entries. */
export function TrackerView({ focus }: { focus?: RunningFocus | undefined }) {
  const categories = useCategories();
  const running = useRunningEntry();
  const [manualOpen, setManualOpen] = useState(false);
  const [status, setStatus] = useState<string>();

  async function act(action: () => Promise<unknown>, success?: string) {
    try {
      await action();
      setStatus(success);
    } catch {
      setStatus('Не удалось сохранить. Попробуйте ещё раз');
    }
  }

  const start = (c: TimeCategory) =>
    running?.categoryId === c.id
      ? undefined
      : act(async () => {
          // One clock at a time: the stopwatch replaces a running focus session (its minutes are kept).
          if (focus && !(await focus.stop())) throw new Error('pomodoro not stopped');
          await startCategoryTimer({ categoryId: c.id, source: 'timer' });
        });

  return (
    <>
      {categories === undefined || running === undefined ? (
        <Empty>Загрузка…</Empty>
      ) : categories.length === 0 ? (
        <Card title="Категории">
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Категорий пока нет. Начните со стартового набора: {DEFAULT_CATEGORY_NAMES.join(', ')}.
          </p>
          <Button className="w-full" onClick={() => act(() => createDefaultCategories())}>
            Добавить стартовый набор
          </Button>
        </Card>
      ) : (
        <>
          {focus && (
            <Card>
              <p role="status" aria-label="Фокус-сессия" className="text-sm text-zinc-600 dark:text-zinc-400">
                Идёт Pomodoro ({focus.phase}), осталось {focus.left}. Запуск таймера учёта остановит его.
              </p>
            </Card>
          )}
          {running && (
            <RunningTimer
              entry={running}
              category={categories.find((c) => c.id === running.categoryId)}
              onStop={() => act(() => stopTimer(running.id))}
            />
          )}
          <Card title={running ? 'Переключить' : 'Начать учёт'}>
            <CategoryButtons categories={categories} activeId={running?.categoryId} onStart={start} />
          </Card>
          <Button variant="secondary" className="w-full" onClick={() => setManualOpen(true)}>
            + Запись вручную
          </Button>
        </>
      )}
      {status && (
        <p role="status" className="mt-2 text-center text-sm text-zinc-500">
          {status}
        </p>
      )}
      {categories && (
        <Sheet open={manualOpen} title="Запись вручную" onClose={() => setManualOpen(false)}>
          <ManualEntryForm
            categories={categories}
            onSave={async (entry) => {
              await addManualEntry(entry);
              setManualOpen(false);
              setStatus('Запись сохранена');
            }}
          />
        </Sheet>
      )}
    </>
  );
}
