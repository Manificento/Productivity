import type { MeditationKind } from '../../../core/types';
import { Button, Card } from '../../../ui';
import { KIND_LABEL } from '../logic/library';

/** Today's plan from the adaptation engine; hidden when the goal is 0 minutes. */
export function PlanCard({
  minutes,
  kind,
  reasons,
  onStart,
}: {
  minutes: number;
  kind: MeditationKind;
  reasons: readonly string[];
  onStart: () => void;
}) {
  if (minutes <= 0) return null;
  return (
    <Card title="План на сегодня">
      <p className="text-base font-medium">{`Сегодня: ${minutes} мин, ${KIND_LABEL[kind]}`}</p>
      {reasons.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-zinc-500 dark:text-zinc-400">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <Button className="mt-3 w-full" onClick={onStart}>
        Начать по плану
      </Button>
    </Card>
  );
}
