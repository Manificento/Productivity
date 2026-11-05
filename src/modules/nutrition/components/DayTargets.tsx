import type { DailyTargets } from '../../../core/adaptation/types';
import { Card, Progress } from '../../../ui';
import { remaining } from '../logic/diary';
import { formatGrams, type Macros } from '../logic/nutrition';

/** Name, eaten, target, unit — one gauge. */
function Gauge({ label, eaten, target, unit }: { label: string; eaten: number; target: number; unit: string }) {
  const r = remaining(eaten, target);
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums">
          {formatGrams(r.eaten)} / {formatGrams(r.target)} {unit}
        </span>
      </div>
      <Progress label={label} value={r.eaten} max={r.target} />
      <p className="mt-1 text-xs tabular-nums text-zinc-500">
        {r.left >= 0 ? `Осталось ${formatGrams(r.left)} ${unit}` : `Больше цели на ${formatGrams(-r.left)} ${unit}`}
      </p>
    </div>
  );
}

/** Eaten vs. the day's targets, and a banner on no-deficit days. Hidden without targets (a link to the goal instead). */
export function DayTargets({ targets, eaten }: { targets: DailyTargets | undefined; eaten: Macros }) {
  if (!targets) return null;
  const { kcal, proteinG, fatG, carbsG } = targets;
  const noDeficit = targets.phase === 'taper' || targets.phase === 'event';
  const why = targets.reasons.filter((r) => r.includes('«') || r.includes('без дефицита'));

  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbsG === undefined) {
    return (
      <Card title="Цель на день">
        <p className="mb-2 text-sm text-zinc-500">Цели по калориям и БЖУ появятся, когда задана цель.</p>
        <button
          type="button"
          onClick={() => document.getElementById('nutrition-goal')?.scrollIntoView?.({ block: 'start' })}
          className="min-h-11 text-sm text-indigo-600 dark:text-indigo-400"
        >
          Задать цель
        </button>
      </Card>
    );
  }
  return (
    <section aria-label="Цель на день">
      {noDeficit && (
        <div
          role="status"
          className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium">Сегодня без дефицита</p>
          {why.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      )}
      <Card title="Цель на день">
        <Gauge label="Калории" eaten={eaten.kcal} target={kcal} unit="ккал" />
        <Gauge label="Белки" eaten={eaten.protein} target={proteinG} unit="г" />
        <Gauge label="Жиры" eaten={eaten.fat} target={fatG} unit="г" />
        <Gauge label="Углеводы" eaten={eaten.carbs} target={carbsG} unit="г" />
      </Card>
    </section>
  );
}
