import type { DailyTargets } from '../../../core/adaptation/types';
import { daysBetween, fromDateKey, shiftDateKey } from '../../../core/dates';
import { muscleGroupsOf, normalizeExerciseName } from '../../../core/exercises';
import type { DateKey, Id, MuscleGroup, PlannedSession, ProgramExercise } from '../../../core/types';

// Adaptive plan (#226, owner's decision 2026-11-07): exercises of a missed session come back in the next sessions.
// The constants below are that decision; revisit them together with personalization (#44).

/** A carried exercise keeps 70 % of its sets (−30 %): catching up, not doubling up. */
export const CARRY_VOLUME_FACTOR = 0.7;
/** A muscle group needs 48 hours between trainings — whole days here, as sessions are planned by day. */
export const RECOVERY_DAYS = 2;
/** A week's sets per muscle group may exceed the original plan by at most 20 %. */
export const WEEKLY_VOLUME_CAP = 1.2;
/** Missed sessions older than this are history, not debt (as «Пропущенные сессии»). */
export const CARRY_LOOKBACK_DAYS = 14;
/** How far ahead a carried exercise may go. */
export const CARRY_HORIZON_DAYS = 14;

export type CarryTargets = Pick<DailyTargets, 'deload' | 'maxWorkoutIntensity'>;

/** What the carry needs from the journal: when which exercises were trained. */
export interface CarryLog {
  date: DateKey;
  exercises?: { name: string; sets: unknown[]; muscleGroups?: MuscleGroup[] }[];
}

export interface CarryAddition {
  sessionId: Id;
  exercise: ProgramExercise;
}

export interface CarryPlan {
  /** Exercises to append to planned sessions, in order. */
  additions: CarryAddition[];
  /** Missed sessions and the names of their exercises dealt with now (append to `carriedOut`). */
  handled: { sessionId: Id; names: string[] }[];
}

export function groupsOf(e: { name: string; muscleGroups?: MuscleGroup[] }): MuscleGroup[] {
  return e.muscleGroups ?? muscleGroupsOf(e.name);
}

/** Monday of the date's week. */
export function weekStart(date: DateKey): DateKey {
  const weekday = fromDateKey(date).getDay(); // 0 = Sunday
  return shiftDateKey(date, -((weekday + 6) % 7));
}

const skipsTraining = (t: CarryTargets | undefined) => !!t && (t.deload || t.maxWorkoutIntensity === 'rest');

/** Sets per group of the given exercises, added into `into`. */
function addSets(
  into: Map<MuscleGroup, number>,
  exercises: { name: string; sets: number; muscleGroups?: MuscleGroup[] }[],
) {
  for (const e of exercises) for (const g of groupsOf(e)) into.set(g, (into.get(g) ?? 0) + e.sets);
}

/**
 * Where the exercises of missed sessions go (#226). For each missed (`skipped`) session of the last two weeks, oldest
 * first, each exercise not yet in `carriedOut` gets 70 % of its sets and goes to the next planned sessions of the same
 * program that:
 * - are not a deload or rest day (targets — adaptation only through targets);
 * - come at least 48 h after the last training of its main group (journal, sessions planned before, earlier carries);
 * - hold no other carried exercise of that main group, and not the same exercise;
 * - keep the week's sets of each of its groups within 120 % of the week's original plan (carried copies are not plan).
 * What does not fit a session goes on to the next one, so the overflow lands in next week instead of piling up.
 * A missed deload or rest day is not carried. An exercise is handled once any of it is placed; the rest is dropped.
 */
export function planCarryOver(input: {
  sessions: PlannedSession[];
  logs: CarryLog[];
  targetsOn: (date: DateKey) => CarryTargets | undefined;
  today: DateKey;
}): CarryPlan {
  const { sessions, logs, targetsOn, today } = input;
  const plan: CarryPlan = { additions: [], handled: [] };
  const from = shiftDateKey(today, -CARRY_LOOKBACK_DAYS);
  const horizon = shiftDateKey(today, CARRY_HORIZON_DAYS);

  for (const programId of new Set(sessions.map((s) => s.programId))) {
    const own = sessions.filter((s) => s.programId === programId).sort((a, b) => a.date.localeCompare(b.date));
    const missed = own.filter((s) => s.status === 'skipped' && s.date >= from && s.date < today);
    const candidates = own.filter((s) => s.status === 'planned' && s.date >= today && s.date <= horizon);
    const added = new Map<Id, ProgramExercise[]>(); // carries placed now, per session

    const weekPlan = (week: DateKey) => {
      const sets = new Map<MuscleGroup, number>();
      addSets(
        sets,
        own.filter((s) => weekStart(s.date) === week).flatMap((s) => s.exercises.filter((e) => !e.carriedFrom)),
      );
      return sets;
    };
    const weekLive = (week: DateKey) => {
      const sets = new Map<MuscleGroup, number>();
      for (const s of own.filter((x) => weekStart(x.date) === week && x.status !== 'skipped')) {
        addSets(sets, s.exercises);
        addSets(sets, added.get(s.id) ?? []);
      }
      return sets;
    };
    const lastTrained = (group: MuscleGroup, before: DateKey): DateKey | undefined => {
      let last: DateKey | undefined;
      const see = (date: DateKey) => {
        if (date < before && (last === undefined || date > last)) last = date;
      };
      for (const log of logs) if (log.exercises?.some((e) => groupsOf(e).includes(group))) see(log.date);
      for (const s of own) {
        if (s.status === 'skipped') continue;
        const all = [...s.exercises, ...(added.get(s.id) ?? [])];
        if (all.some((e) => groupsOf(e).includes(group))) see(s.date);
      }
      return last;
    };

    for (const source of missed) {
      const done = new Set((source.carriedOut ?? []).map(normalizeExerciseName));
      const open = source.exercises.filter((e) => !e.carriedFrom && !done.has(normalizeExerciseName(e.name)));
      if (open.length === 0) continue;
      if (skipsTraining(targetsOn(source.date))) {
        plan.handled.push({ sessionId: source.id, names: open.map((e) => e.name) });
        continue;
      }
      const names: string[] = [];
      for (const exercise of open) {
        const groups = groupsOf(exercise);
        const main = groups[0];
        let left = Math.max(1, Math.round(exercise.sets * CARRY_VOLUME_FACTOR));
        for (const target of candidates) {
          if (left === 0) break;
          if (target.date <= source.date || skipsTraining(targetsOn(target.date))) continue;
          const there = [...target.exercises, ...(added.get(target.id) ?? [])];
          const key = normalizeExerciseName(exercise.name);
          if (there.some((e) => normalizeExerciseName(e.name) === key && e.carriedFrom !== undefined)) continue;
          if (main && there.some((e) => e.carriedFrom !== undefined && groupsOf(e)[0] === main)) continue;
          if (main) {
            const last = lastTrained(main, target.date);
            if (last !== undefined && daysBetween(last, target.date) < RECOVERY_DAYS) continue;
          }
          const week = weekStart(target.date);
          const planned = weekPlan(week);
          const live = weekLive(week);
          let room = left;
          for (const g of groups)
            room = Math.min(room, Math.floor((planned.get(g) ?? 0) * WEEKLY_VOLUME_CAP - (live.get(g) ?? 0)));
          if (room < 1) continue;
          const copy: ProgramExercise = {
            ...exercise,
            sets: room,
            carriedFrom: source.date,
            ...(groups.length > 0 && { muscleGroups: groups }),
          };
          plan.additions.push({ sessionId: target.id, exercise: copy });
          added.set(target.id, [...(added.get(target.id) ?? []), copy]);
          left -= room;
        }
        if (left < Math.max(1, Math.round(exercise.sets * CARRY_VOLUME_FACTOR))) names.push(exercise.name);
      }
      if (names.length > 0) plan.handled.push({ sessionId: source.id, names });
    }
  }
  return plan;
}
