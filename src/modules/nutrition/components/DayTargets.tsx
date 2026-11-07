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

/** Caffeine cutoff and the «no new foods» hint of the day. */
function DayHints({ targets }: { targets: DailyTargets }) {
  return (
    <div className="mb-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
      <p className="text-sm">
        Кофеин — до <strong>{targets.caffeineCutoff}</strong>
      </p>
      {targets.noNewFoods && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">Сегодня лучше без новых продуктов</p>
      )}
    </div>
  );
}

/**
 * The single «Цель на день» card: caffeine cutoff, eaten vs. the day's targets, and a banner on no-deficit days.
 * Without kcal targets the gauges give way to a link to the goal. Hidden when the day has no targets at all.
 */
export function DayTargets({ targets, eaten }: { targets: DailyTargets | undefined; eaten: Macros }) {
  if (!targets) return null;
  const { kcal, proteinG, fatG, carbsG } = targets;
  // The engine decides: it adds this reason only when a deficit was actually dropped (goal «снизить»).
  const noDeficitReason = targets.reasons.find((r) => r.includes('без дефицита'));
  // Why: the phase reason about the event («Завтра «…»…» / «Сегодня «…»…»).
  const why = targets.reasons.filter((r) => r.startsWith('Завтра «') || r.startsWith('Сегодня «'));

  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbsG === undefined) {
    return (
      <section aria-label="Цель на день">
        <Card title="Цель на день">
          <DayHints targets={targets} />
          <p className="mb-2 text-sm text-zinc-500">Цели по калориям и БЖУ появятся, когда будут вес, рост и цель.</p>
          <button
            type="button"
            onClick={() => document.getElementById('nutrition-goal')?.scrollIntoView?.({ block: 'start' })}
            className="min-h-11 text-sm text-indigo-600 dark:text-indigo-400"
          >
            Задать цель
          </button>
        </Card>
      </section>
    );
  }
  return (
    <section aria-label="Цель на день">
      {noDeficitReason && (
        <div
          role="status"
          className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium">Сегодня без дефицита</p>
          <p>{noDeficitReason}</p>
          {why.map((r, i) => (
            <p key={`${i}-${r}`}>{r}</p>
          ))}
        </div>
      )}
      <Card title="Цель на день">
        <DayHints targets={targets} />
        <Gauge label="Калории" eaten={eaten.kcal} target={kcal} unit="ккал" />
        <Gauge label="Белки" eaten={eaten.protein} target={proteinG} unit="г" />
        <Gauge label="Жиры" eaten={eaten.fat} target={fatG} unit="г" />
        <Gauge label="Углеводы" eaten={eaten.carbs} target={carbsG} unit="г" />
      </Card>
    </section>
  );
}
