import { Link } from 'react-router-dom';
import { Button, Card } from '../../../ui';

export type MindSaveStatus = 'saving' | 'saved' | 'error' | 'empty';

const SAVE_MESSAGES: Record<MindSaveStatus, string> = {
  saving: 'Сохраняю результат…',
  saved: 'Результат сохранён.',
  error: 'Не удалось сохранить результат. Попробуйте ещё раз.',
  empty: 'Ни одного ответа — результат не сохранён. Попробуйте ещё раз.',
};

/** Short summary of a finished trainer session with the comparison to my average. */
export function MindResult({
  rows,
  status,
  comparison,
  onRetry,
}: {
  rows: [label: string, value: string][];
  status: MindSaveStatus;
  /** Sentence comparing with the personal average; shown once saved. */
  comparison?: string;
  onRetry: () => void;
}) {
  const failed = status === 'error' || status === 'empty';
  return (
    <Card title="Результат">
      <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid">
            <dt>{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p
        role={failed ? 'alert' : 'status'}
        className={`mb-2 text-sm ${failed ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500'}`}
      >
        {SAVE_MESSAGES[status]}
      </p>
      {status === 'saved' && comparison && <p className="mb-4 text-sm text-zinc-500">{comparison}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onRetry} disabled={status === 'saving'}>
          Ещё раз
        </Button>
        <Link
          to="/cognition"
          className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Готово
        </Link>
      </div>
    </Card>
  );
}
