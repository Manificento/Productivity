import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../ui';
import { breathAt, patternById, type PatternId } from '../logic/patterns';
import { formatClock, interruptedMinutes, remainingMs } from '../logic/timer';
import { saveSession } from '../data/sessionStore';

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
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState<'full' | 'partial' | 'none' | null>(null);
  const finished = useRef(false);
  const pattern = patternById(patternId);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (remainingMs(startedAt.current, durationMin, t) === 0 && !finished.current) {
        finished.current = true;
        setDone(true);
        navigator.vibrate?.([200, 100, 200]);
        void saveSession({ startedAt: startedAt.current, durationMin, pattern: patternId, completed: true }).then(() =>
          setSaved('full'),
        );
      }
    }, 250);
    return () => clearInterval(id);
  }, [done, durationMin, patternId]);

  async function stop() {
    if (finished.current) return;
    finished.current = true;
    const t = Date.now();
    const minutes = interruptedMinutes(startedAt.current, t);
    if (minutes === null) {
      setSaved('none');
    } else {
      await saveSession({ startedAt: startedAt.current, durationMin: minutes, pattern: patternId, completed: false });
      setSaved('partial');
    }
    setDone(true);
  }

  if (done) {
    const text =
      saved === 'full'
        ? 'Сессия завершена и записана.'
        : saved === 'partial'
          ? 'Сессия прервана — записана с пометкой «прервана».'
          : 'Меньше минуты — сессия не записана.';
    return (
      <div className="flex flex-col items-center gap-4 py-6" role="status">
        <p className="text-lg font-semibold">Готово</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
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
          className="flex h-56 w-56 items-center justify-center rounded-full bg-indigo-500/30 text-lg font-medium"
          style={{ transform: `scale(${breath?.scale ?? 0.7})`, transition: 'transform 250ms linear' }}
        >
          {breath?.label ?? ''}
        </div>
      </div>
      <p className="text-4xl font-semibold tabular-nums" aria-label="Осталось времени">
        {formatClock(left)}
      </p>
      <Button onClick={() => void stop()}>Завершить</Button>
    </div>
  );
}
