import { Button, Card } from '../../../ui';
import type { PvtSummary } from '../logic/pvt';

export type SaveStatus = 'saving' | 'saved' | 'noReactions' | 'error';

const SAVE_MESSAGES: Record<SaveStatus, string> = {
  saving: 'Сохраняю результат…',
  saved: 'Результат сохранён.',
  noReactions: 'Ни одной засчитанной реакции — результат не сохранён. Попробуйте ещё раз.',
  error: 'Не удалось сохранить результат. Попробуйте ещё раз.',
};

export function PvtResults({
  result,
  status,
  onClose,
  onRetry,
}: {
  result: PvtSummary;
  status: SaveStatus;
  onClose: () => void;
  onRetry: () => void;
}) {
  const failed = status === 'noReactions' || status === 'error';
  return (
    <Card title="Результат">
      <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        <dt>Медиана реакции</dt>
        <dd className="text-right font-semibold tabular-nums">
          {result.reactionTimesMs.length ? `${result.medianRtMs} мс` : '—'}
        </dd>
        <dt>Пропуски (&gt; 500 мс)</dt>
        <dd className="text-right font-semibold tabular-nums">{result.lapses}</dd>
        <dt>Фальстарты</dt>
        <dd className="text-right font-semibold tabular-nums">{result.falseStarts}</dd>
      </dl>
      <p
        role={failed ? 'alert' : 'status'}
        className={`mb-4 text-sm ${failed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500'}`}
      >
        {SAVE_MESSAGES[status]}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onRetry}>
          Ещё раз
        </Button>
        <Button className="flex-1" onClick={onClose} disabled={status === 'saving'}>
          Готово
        </Button>
      </div>
    </Card>
  );
}
