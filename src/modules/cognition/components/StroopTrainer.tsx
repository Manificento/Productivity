import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../../../ui';
import {
  STROOP_COLORS,
  generateStroopTrial,
  isCongruent,
  scoreStroop,
  type StroopAnswer,
  type StroopColorId,
  type StroopScore,
  type StroopTrial,
} from '../logic/stroop';

export interface StroopFinish extends StroopScore {
  startedAt: number;
  durationMs: number;
}

const byId = (id: StroopColorId) => STROOP_COLORS.find((c) => c.id === id)!;

type View = { phase: 'intro' } | { phase: 'aborted' } | { phase: 'running'; trial: StroopTrial; secondsLeft: number };

/**
 * Stroop session. Timing uses `performance.now()`; a `requestAnimationFrame` loop only ends the session
 * and updates the countdown. Going to the background cancels the run.
 */
export function StroopTrainer({
  durationMs,
  random = Math.random,
  onFinish,
}: {
  durationMs: number;
  random?: () => number;
  onFinish: (result: StroopFinish) => void;
}) {
  const [view, setView] = useState<View>({ phase: 'intro' });
  const answers = useRef<StroopAnswer[]>([]);
  const run = useRef<{ endsAt: number; shownAt: number; epoch: number; trial: StroopTrial } | null>(null);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const start = () => {
    const now = performance.now();
    const trial = generateStroopTrial(random);
    answers.current = [];
    run.current = { endsAt: now + durationMs, shownAt: now, epoch: Date.now(), trial };
    setView({ phase: 'running', trial, secondsLeft: Math.ceil(durationMs / 1_000) });
  };

  const running = view.phase === 'running';
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const loop = () => {
      const current = run.current;
      if (!current) return;
      const now = performance.now();
      if (now >= current.endsAt) {
        run.current = null;
        setView({ phase: 'intro' });
        onFinishRef.current({ ...scoreStroop(answers.current), startedAt: current.epoch, durationMs });
        return;
      }
      const secondsLeft = Math.ceil((current.endsAt - now) / 1_000);
      setView((v) => (v.phase === 'running' && v.secondsLeft !== secondsLeft ? { ...v, secondsLeft } : v));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      run.current = null;
      setView({ phase: 'aborted' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, durationMs]);

  const answer = (picked: StroopColorId) => {
    const current = run.current;
    if (!current) return;
    const now = performance.now();
    answers.current.push({
      congruent: isCongruent(current.trial),
      correct: picked === current.trial.ink,
      rtMs: Math.round(now - current.shownAt),
    });
    const trial = generateStroopTrial(random);
    run.current = { ...current, trial, shownAt: now };
    setView((v) => (v.phase === 'running' ? { ...v, trial } : v));
  };

  if (view.phase === 'running') {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-zinc-50 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] dark:bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-zinc-500">Осталось {view.secondsLeft} с</span>
          <Button
            variant="secondary"
            onClick={() => {
              run.current = null;
              setView({ phase: 'intro' });
            }}
          >
            Прервать
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <span className="text-sm text-zinc-500">Каким цветом напечатано слово?</span>
          <span data-testid="stroop-word" className={`text-5xl font-bold ${byId(view.trial.ink).ink}`}>
            {byId(view.trial.word).name}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {STROOP_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => answer(c.id)}
              className="min-h-16 rounded-2xl bg-zinc-200 text-lg font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {view.phase === 'aborted' && (
        <Card>
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
            Сессия прервана: приложение уходило в фон. Время реакции в это время не измерить честно, поэтому результат
            не засчитан. Начните заново.
          </p>
        </Card>
      )}
      <Card title="Как проходить">
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Сессия длится {Math.round(durationMs / 1_000)} с.</li>
          <li>
            На экране — название цвета, напечатанное другим цветом. Нажмите кнопку с цветом, КОТОРЫМ напечатано слово.
          </li>
          <li>Читать слово не нужно — именно это и мешает. Отвечайте быстро, но без ошибок.</li>
        </ul>
        <Button className="w-full" onClick={start}>
          {view.phase === 'aborted' ? 'Начать заново' : 'Начать'}
        </Button>
      </Card>
    </>
  );
}
