/** Today's mind-training plan from `DailyTargets` (adaptation is only ever read through `useDailyTargets`). */

/** A light day (taper, event) allows only short easy sessions. */
export const LIGHT_DAY_MAX_MIN = 5;

export interface PlanItem {
  kind: 'nback' | 'stroop';
  min: number;
}

export type MindPlan =
  | {
      kind: 'none';
      /** Short cause taken from the engine's reasons, e.g. «низкая энергия в чек-ине». */ cause?: string;
    }
  | { kind: 'plan'; totalMin: number; items: PlanItem[]; light: boolean };

export interface PlanInput {
  mindTrainingMin: number;
  deload: boolean;
  reasons: readonly string[];
}

/** «Низкая энергия в чек-ине: нагрузка −20%, без тренажёров ума» → «низкая энергия в чек-ине». */
function causeOf(reasons: readonly string[]): string | undefined {
  const reason = reasons.find((r) => /тренажёр/i.test(r));
  if (!reason) return undefined;
  const head = reason.split(/[:,]/)[0].trim();
  return head ? head.charAt(0).toLowerCase() + head.slice(1) : undefined;
}

/**
 * 0 min → no trainers (with the cause). A light day (deload: taper or event) → one easy Stroop session of
 * ≤ 5 min. Otherwise the minutes are split between n-back (the larger half) and Stroop.
 */
export function planMindTraining({ mindTrainingMin, deload, reasons }: PlanInput): MindPlan {
  if (mindTrainingMin <= 0) return { kind: 'none', cause: causeOf(reasons) };
  if (deload) {
    const min = Math.min(mindTrainingMin, LIGHT_DAY_MAX_MIN);
    return { kind: 'plan', totalMin: min, items: [{ kind: 'stroop', min }], light: true };
  }
  const nback = Math.ceil(mindTrainingMin / 2);
  const items: PlanItem[] = [{ kind: 'nback', min: nback }];
  if (mindTrainingMin - nback > 0) items.push({ kind: 'stroop', min: mindTrainingMin - nback });
  return { kind: 'plan', totalMin: mindTrainingMin, items, light: false };
}

export interface DayProgress {
  doneMin: number;
  /** All planned minutes are done. */
  closed: boolean;
}

/** Minutes done today (trainer sessions of the day, planned or manual) against the plan. */
export function planProgress(totalMin: number, sessionDurationsMs: number[]): DayProgress {
  const doneMs = sessionDurationsMs.reduce((a, b) => a + b, 0);
  return { doneMin: Math.round(doneMs / 60_000), closed: totalMin > 0 && doneMs >= totalMin * 60_000 };
}
