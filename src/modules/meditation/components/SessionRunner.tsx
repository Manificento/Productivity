import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../../ui';
import { saveSession } from '../data/sessionStore';
import { breathAt, patternById, type PatternId } from '../logic/patterns';
import { formatClock, interruptedMinutes, remainingMs } from '../logic/timer';

type SaveState = 'saving' | 'full' | 'partial' | 'none' | 'error';

const MESSAGES: Record<SaveState, string> = {
  saving: 'Сохраняю…',
  full: 'Сессия завершена и записана.',
  partial: 'Сессия прервана — записана с пометкой «прервана».',
  none: 'Меньше минуты — сессия не записана.',
  error: 'Не удалось сохранить сессию.',
};

export function SessionRunner({
  durationMin,
  patternId,
  onClose,
}: {
  durationMin: number;
  patternId: PatternId;
  onClose: () => void;
}) {
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState<SaveState | null>(null);
  const finished = useRef(false);
  const pattern = patternById(patternId);

  /** Ends the session once: completed when the time is up, otherwise interrupted (kept from 1 min). */
  const finish = useCallback(
    async (t: number, report: boolean) => {
      if (finished.current) return;
      finished.current = true;
      const complete = remainingMs(startedAt.current, durationMin, t) === 0;
      const minutes = complete ? durationMin : interruptedMinutes(startedAt.current, t);
      if (report) setSaved(minutes === null ? 'none' : 'saving');
      if (complete) beep();
      if (minutes === null) return;
      try {
        await saveSession({
          startedAt: startedAt.current,
          durationMin: minutes,
          pattern: patternId,
          completed: complete,
        });
        if (report) setSaved(complete ? 'full' : 'partial');
      } catch {
        if (report) setSaved('error');
      }
    },
    [durationMin, patternId],
  );

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (remainingMs(startedAt.current, durationMin, t) === 0) void finish(t, true);
    };
    const id = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [durationMin, finish]);

  // Leaving the page mid-session keeps an interrupted session of a minute or more.
  useEffect(() => {
    const leave = () => void finish(Date.now(), false);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [finish]);

  if (saved !== null) {
    return (
      <div className="flex flex-col items-center gap-4 py-6" role="status">
        <p className="text-lg font-semibold">{saved === 'error' ? 'Ошибка' : 'Готово'}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{MESSAGES[saved]}</p>
        <Button onClick={onClose}>Закрыть</Button>
      </div>
    );
  }

  const left = remainingMs(startedAt.current, durationMin, now);
  const breath = breathAt(pattern, now - startedAt.current);
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="flex h-56 w-56 items-center justify-center">
        <div
          data-testid="breath-circle"
          className="flex h-56 w-56 items-center justify-center rounded-full bg-indigo-500/30 text-lg font-medium motion-reduce:transition-none"
          style={{ transform: `scale(${breath?.scale ?? 0.7})`, transition: 'transform 250ms linear' }}
        >
          {breath?.label ?? ''}
        </div>
      </div>
      <p className="text-4xl font-semibold tabular-nums" aria-label="Осталось времени">
        {formatClock(left)}
      </p>
      <Button onClick={() => void finish(Date.now(), true)}>Завершить</Button>
    </div>
  );
}

/** Completion signal: vibration where supported (no audio without the owner's decision). */
function beep() {
  navigator.vibrate?.([200, 100, 200]);
}
