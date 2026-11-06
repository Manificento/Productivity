import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Card } from '../../../ui';
import {
  GRID_CELLS,
  STIMULUS_MS,
  TRIAL_MS,
  generateSequence,
  scoreNback,
  trialCountFor,
  type NbackAnswer,
  type NbackScore,
} from '../logic/nback';

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1_000);
  if (s % 60 !== 0) return `${s} с`;
  const m = s / 60;
  return `${m} ${m === 1 ? 'минуту' : m < 5 ? 'минуты' : 'минут'}`;
}

export interface NbackFinish extends NbackScore {
  startedAt: number;
  durationMs: number;
  level: number;
}

type View = { phase: 'intro' } | { phase: 'aborted' } | { phase: 'running'; trial: number; cell?: number };

/**
 * The n-back session. Timing uses only `performance.now()` inside a `requestAnimationFrame` loop:
 * trial i starts at i·2.5 s, the cell is lit for the first 0.8 s, the answer window is the whole trial.
 * Going to the background cancels the run — its timings would be wrong.
 */
export function NbackTrainer({
  level,
  durationMs,
  random = Math.random,
  onFinish,
}: {
  level: number;
  durationMs: number;
  /** Source of randomness for the sequence (injected in tests). */
  random?: () => number;
  onFinish: (result: NbackFinish) => void;
}) {
  const [view, setView] = useState<View>({ phase: 'intro' });
  const [started, setStarted] = useState<{ sequence: number[]; at: number; epoch: number; level: number } | null>(null);
  const answers = useRef<NbackAnswer[]>([]);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const start = () => {
    const sequence = generateSequence(trialCountFor(durationMs), level, random);
    answers.current = [];
    setStarted({ sequence, at: performance.now(), epoch: Date.now(), level });
    setView({ phase: 'running', trial: 0, cell: sequence[0] });
  };

  const running = view.phase === 'running';

  useEffect(() => {
    if (!running || !started) return;
    const { sequence, at, epoch, level: startLevel } = started;
    let frame = 0;
    const loop = () => {
      const elapsed = performance.now() - at;
      const trial = Math.floor(elapsed / TRIAL_MS);
      if (trial >= sequence.length) {
        const score = scoreNback(sequence, startLevel, answers.current);
        setView({ phase: 'intro' });
        onFinishRef.current({ ...score, startedAt: epoch, durationMs, level: startLevel });
        return;
      }
      const cell = elapsed - trial * TRIAL_MS < STIMULUS_MS ? sequence[trial] : undefined;
      setView((v) =>
        v.phase === 'running' && v.trial === trial && v.cell === cell ? v : { phase: 'running', trial, cell },
      );
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setView({ phase: 'aborted' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, started, durationMs]);

  const press = () => {
    if (!started) return;
    const elapsed = performance.now() - started.at;
    const trial = Math.floor(elapsed / TRIAL_MS);
    if (trial < 0 || trial >= started.sequence.length || answers.current[trial]?.pressed) return;
    answers.current[trial] = { pressed: true, rtMs: Math.round(elapsed - trial * TRIAL_MS) };
    setView((v) => ({ ...v })); // repaint the pressed state
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    press();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    press();
  };

  if (view.phase === 'running') {
    const answered = answers.current[view.trial]?.pressed === true;
    const total = started?.sequence.length ?? 0;
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-zinc-500">
            n = {started?.level ?? level} · шаг {Math.min(view.trial + 1, total)} из {total}
          </span>
          <Button variant="secondary" onClick={() => setView({ phase: 'intro' })}>
            Прервать
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center px-4">
          <div role="img" aria-label="Сетка 3×3" className="grid w-full max-w-xs grid-cols-3 gap-2">
            {Array.from({ length: GRID_CELLS }, (_, i) => (
              <div
                key={i}
                data-testid="nback-cell"
                data-lit={view.cell === i}
                className={`aspect-square rounded-xl ${view.cell === i ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-800'}`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className={`m-4 min-h-16 touch-none select-none rounded-2xl text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
            answered ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
          }`}
        >
          Совпало
        </button>
      </div>
    );
  }

  return (
    <>
      {view.phase === 'aborted' && (
        <Card>
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            Сессия прервана: приложение уходило в фон. Время реакции в это время не измерить честно, поэтому результат
            не засчитан. Начните заново, не переключаясь на другие приложения.
          </p>
        </Card>
      )}
      <Card title="Как проходить">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Сессия длится {formatDuration(durationMs)}. Квадраты загораются в сетке 3×3 один за другим.</li>
          <li>
            Нажмите «Совпало», если загоревшийся квадрат — тот же, что был <strong>{level}</strong>{' '}
            {level === 1 ? 'шаг' : level < 5 ? 'шага' : 'шагов'} назад.
          </li>
          <li>Если не совпал — ничего не нажимайте. Не переключайтесь на другие приложения.</li>
        </ul>
        <p className="mb-4 text-sm font-medium">
          Ваш уровень: n = <span className="tabular-nums">{level}</span>
        </p>
        <Button className="w-full" onClick={start}>
          {view.phase === 'aborted' ? 'Начать заново' : 'Начать'}
        </Button>
      </Card>
    </>
  );
}
