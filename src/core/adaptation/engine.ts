import { daysBetween } from '../dates';
import type { DateKey, LifeEvent } from '../types';
import { baselineTargets, CONDITION_RULES, PHASE_RULES } from './rules';
import type { AdaptationContext, DailyTargets, Phase } from './types';

/** Phase of `date` relative to one event. */
export function phaseFor(date: DateKey, event: LifeEvent): Phase {
  const d = daysBetween(date, event.date); // days until the event
  if (d === 0) return 'event';
  if (d === 1) return 'taper';
  if (d >= 2 && d <= Math.max(2, event.prepDays)) return 'prep';
  if (d === -1) return 'recovery';
  return 'normal';
}

/**
 * Picks the event that drives the day: highest importance first, then the nearest one.
 * Returns undefined when no event affects the date.
 */
export function selectDrivingEvent(
  date: DateKey,
  events: LifeEvent[],
): { event: LifeEvent; phase: Exclude<Phase, 'normal'> } | undefined {
  const candidates = events
    .map((event) => ({ event, phase: phaseFor(date, event) }))
    .filter((c): c is { event: LifeEvent; phase: Exclude<Phase, 'normal'> } => c.phase !== 'normal')
    .sort(
      (a, b) =>
        b.event.importance - a.event.importance ||
        Math.abs(daysBetween(date, a.event.date)) - Math.abs(daysBetween(date, b.event.date)),
    );
  return candidates[0];
}

/** Pure function: same inputs → same targets. All modules read targets from here. */
export function computeDailyTargets(date: DateKey, ctx: AdaptationContext): DailyTargets {
  let t = baselineTargets(date, ctx.baseline);

  const driving = selectDrivingEvent(date, ctx.events);
  if (driving) {
    const rule = PHASE_RULES.find((r) => r.phase === driving.phase);
    if (rule) t = rule.apply(t, driving.event);
    t = { ...t, phase: driving.phase, activeEventId: driving.event.id };
  }

  for (const rule of CONDITION_RULES) {
    if (rule.when(ctx)) t = rule.apply(t, ctx);
  }

  return t;
}
