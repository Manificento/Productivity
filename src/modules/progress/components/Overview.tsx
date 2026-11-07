import { useState } from 'react';
import { Card, Empty } from '../../../ui';
import { XP_HINTS, type ProgressSummary } from '../logic/xp';

const ACK_KEY = 'progress.importAck';

/** One-time notice per device: remembered in localStorage, which may be unavailable. */
function useOnce(show: boolean): boolean {
  const [seen] = useState(() => {
    try {
      return localStorage.getItem(ACK_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [visible] = useState(show && !seen);
  if (show && !seen) {
    try {
      localStorage.setItem(ACK_KEY, '1');
    } catch {
      /* ignore */
    }
  }
  return visible;
}

export function Overview({ s }: { s: ProgressSummary }) {
  const notice = useOnce(s.imported > 0);
  const pct = Math.round((s.into / s.needed) * 100);
  return (
    <>
      <Card>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Уровень</p>
        <p className="text-4xl font-bold" data-testid="level">
          {s.level}
        </p>
        <div
          role="progressbar"
          aria-label="Прогресс до следующего уровня"
          aria-valuemin={0}
          aria-valuemax={s.needed}
          aria-valuenow={s.into}
          className="mt-2 h-3 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700"
        >
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm" data-testid="level-progress">
          {s.into} / {s.needed} XP до уровня {s.level + 1}
        </p>
      </Card>
      <Card>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Сегодня</dt>
            <dd className="text-lg font-semibold" data-testid="xp-today">
              {s.today} XP
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">За 7 дней</dt>
            <dd className="text-lg font-semibold" data-testid="xp-week">
              {s.week} XP
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Всего</dt>
            <dd className="text-lg font-semibold" data-testid="xp-total">
              {s.total} XP
            </dd>
          </div>
        </dl>
      </Card>
      {s.imported > 0 && (
        <Card>
          <p className="text-sm" data-testid="xp-imported">
            Перенесено из истории: {s.imported} очков
          </p>
          {notice && (
            <p role="status" className="mt-1 text-sm text-indigo-600 dark:text-indigo-400">
              Твоя история учтена: уровень {s.level}
            </p>
          )}
        </Card>
      )}
      {s.total === 0 && (
        <Card>
          <Empty>Пока нет опыта. Он начисляется за:</Empty>
          <ul className="mt-2 flex flex-col gap-1 text-sm" aria-label="Что даёт опыт">
            {XP_HINTS.map((h) => (
              <li key={h.label} className="flex justify-between">
                <span>{h.label}</span>
                <span className="text-zinc-500 dark:text-zinc-400">+{h.xp} XP</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
