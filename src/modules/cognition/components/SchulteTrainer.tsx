import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../../../ui';
import {
  SCHULTE_SIZE,
  generateTable,
  schulteResult,
  startSchulte,
  tapSchulte,
  type SchulteResult,
  type SchulteState,
} from '../logic/schulte';

export interface SchulteFinish extends SchulteResult {
  startedAt: number;
}

/** Schulte table 5×5. A new random table at every start; time is `performance.now()`. */
export function SchulteTrainer({
  random = Math.random,
  onFinish,
}: {
  random?: () => number;
  onFinish: (result: SchulteFinish) => void;
}) {
  const [table, setTable] = useState<number[] | null>(null);
  const [state, setState] = useState<SchulteState | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const [aborted, setAborted] = useState(false);
  const epoch = useRef(0);
  const running = table !== null;

  // Time keeps running in the background, so a hidden app cancels the run instead of saving an inflated time.
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      setTable(null);
      setState(null);
      setAborted(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [running]);

  const start = () => {
    setTable(generateTable(random));
    setState(startSchulte(performance.now()));
    setWrong(null);
    setAborted(false);
    epoch.current = Date.now();
  };

  const tap = (n: number) => {
    if (!state) return;
    const next = tapSchulte(state, n, performance.now());
    setState(next);
    setWrong(next.errors > state.errors ? n : null);
    const result = schulteResult(next);
    if (result) {
      setTable(null);
      setState(null);
      onFinish({ ...result, startedAt: epoch.current });
    }
  };

  if (table && state) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm">
            Найдите: <strong className="text-lg tabular-nums">{state.next}</strong>
            <span className="ml-3 text-zinc-500">ошибок: {state.errors}</span>
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              setTable(null);
              setState(null);
            }}
          >
            Прервать
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="grid w-full max-w-sm grid-cols-5 gap-1.5">
            {table.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => tap(n)}
                className={`aspect-square min-h-11 rounded-lg text-xl font-semibold tabular-nums ${
                  wrong === n
                    ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100'
                    : n < state.next
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {aborted && (
        <Card>
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            Сессия прервана: приложение уходило в фон, время не измерить честно, поэтому результат не засчитан. Начните
            заново.
          </p>
        </Card>
      )}
      <Card title="Как проходить">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>В таблице 5×5 числа от 1 до {SCHULTE_SIZE} перемешаны.</li>
          <li>Нажимайте числа по порядку, как можно быстрее. Взгляд держите в центре таблицы.</li>
          <li>Неверное нажатие считается ошибкой. Таблица каждый раз новая.</li>
        </ul>
        <Button className="w-full" onClick={start}>
          Начать
        </Button>
      </Card>
    </>
  );
}
