import { Card, Progress } from '../../../ui';
import type { FocusQuota } from '../logic/focusQuota';

/** How many focus sessions today's adaptation asks for, and how many are done. */
export function FocusQuotaCard({ quota }: { quota: FocusQuota }) {
  if (quota.kind === 'none') {
    return (
      <Card title="Фокус-сессии">
        <p className="font-medium">Сегодня без фокус-сессий</p>
        {quota.reasons.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            {quota.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </Card>
    );
  }
  return (
    <Card title="Фокус-сессии">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-lg font-semibold tabular-nums">
          {quota.done} из {quota.target}
        </p>
        {quota.done >= quota.target && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Норма дня выполнена</p>
        )}
      </div>
      <Progress label="Фокус-сессии сегодня" value={quota.done} max={quota.target} />
    </Card>
  );
}
