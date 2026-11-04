import { Button, Card } from '../../../ui';
import type { TimeCategory, TimeEntry } from '../../../core/types';
import { formatDuration } from '../logic/timer';
import { useNow } from './useNow';

export function RunningTimer({
  entry,
  category,
  onStop,
}: {
  entry: TimeEntry;
  category: TimeCategory | undefined;
  onStop: () => void;
}) {
  const now = useNow();
  return (
    <Card>
      <div role="timer" aria-label="Идущий таймер" className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-500">{category?.name ?? 'Без категории'}</p>
          <p className="text-3xl font-semibold tabular-nums">{formatDuration(now - entry.start)}</p>
        </div>
        <Button variant="danger" onClick={onStop}>
          Стоп
        </Button>
      </div>
    </Card>
  );
}
