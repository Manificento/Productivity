import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Card } from '../../../ui';
import type { PvtRun } from '../data/cognitiveTests';
import { randomDelayMs, startPvt, tapPvt, tickPvt, type PvtRunning, type PvtState } from '../logic/pvt';

type View = { phase: 'intro' } | { phase: 'aborted' } | { phase: 'running'; run: PvtRunning; secondsLeft: number };

/**
 * The PVT itself. Timing uses only `performance.now()`; the stimulus is shown from a
 * `requestAnimationFrame` loop. Going to the background cancels the run — its timings would be wrong.
 */
export function PvtTest({
  durationMs,
  random = Math.random,
  onFinish,
}: {
  durationMs: number;
  /** Source of randomness for stimulus delays (injected in tests). */
  random?: () => number;
  onFinish: (run: PvtRun) => void;
}) {
  const [view, setView] = useState<View>({ phase: 'intro' });
  const machine = useRef<PvtRunning | null>(null);
  const startedAtEpoch = useRef(0);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const show = useCallback((next: PvtRunning, now: number) => {
    machine.current = next;
    setView({ phase: 'running', run: next, secondsLeft: Math.max(0, Math.ceil((next.endsAt - now) / 1_000)) });
  }, []);

  const start = () => {
    const now = performance.now();
    startedAtEpoch.current = Date.now();
    show(startPvt(now, durationMs, randomDelayMs(random)), now);
  };

  const running = view.phase === 'running';

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let lastSecondsLeft = -1;
    const loop = () => {
      const current = machine.current;
      if (!current) return;
      const now = performance.now();
      const next: PvtState = tickPvt(current, now);
      if (next.phase === 'done') {
        machine.current = null;
        setView({ phase: 'intro' });
        onFinishRef.current({ startedAt: startedAtEpoch.current, durationMs: next.durationMs, result: next.result });
        return;
      }
      const secondsLeft = Math.ceil((next.endsAt - now) / 1_000);
      if (next !== current || secondsLeft !== lastSecondsLeft) {
        lastSecondsLeft = secondsLeft;
        show(next, now);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      machine.current = null;
      setView({ phase: 'aborted' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, show]);

  const tap = () => {
    const current = machine.current;
    if (!current) return;
    const now = performance.now();
    show(tapPvt(current, now, randomDelayMs(random)), now);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
    e.preventDefault();
    tap();
  };

  const cancel = () => {
    machine.current = null;
    setView({ phase: 'intro' });
  };

  if (view.phase === 'running') {
    const { run, secondsLeft } = view;
    const stimulus = run.shownAt !== undefined;
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-zinc-500" aria-live="off">
            Осталось {secondsLeft} с
          </span>
          <Button variant="secondary" onClick={cancel}>
            Прервать
          </Button>
        </div>
        <button
          type="button"
          aria-label="Область реакции"
          onPointerDown={tap}
          onKeyDown={onKeyDown}
          className="m-4 mt-0 flex flex-1 touch-none select-none flex-col items-center justify-center rounded-3xl bg-zinc-100 outline-none dark:bg-zinc-900"
        >
          {stimulus ? (
            <span
              role="status"
              className="flex size-40 items-center justify-center rounded-full bg-rose-600 text-2xl font-bold text-white"
            >
              Жми!
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2" role="status">
              {run.feedback?.kind === 'falseStart' && (
                <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">Фальстарт — рано!</span>
              )}
              {run.feedback?.kind === 'reaction' && (
                <span className="text-3xl font-bold tabular-nums">{Math.round(run.feedback.ms)} мс</span>
              )}
              <span className="text-sm text-zinc-500">Ждите красный круг…</span>
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <>
      {view.phase === 'aborted' && (
        <Card>
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            Тест прерван: приложение уходило в фон. Время реакции в это время не измерить честно, поэтому результат не
            засчитан. Пройдите тест заново, не переключаясь на другие приложения.
          </p>
        </Card>
      )}
      <Card title="Как проходить">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Тест длится {Math.round(durationMs / 1_000)} с.</li>
          <li>Через случайные паузы (2–10 с) появляется красный круг — коснитесь экрана как можно быстрее.</li>
          <li>Касание до круга — фальстарт. Не переключайтесь на другие приложения.</li>
        </ul>
        <Button className="w-full" onClick={start}>
          {view.phase === 'aborted' ? 'Начать заново' : 'Начать'}
        </Button>
      </Card>
    </>
  );
}
