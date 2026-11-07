import { shiftDateKey } from '../../../core/dates';
import { MUSCLE_GROUPS } from '../../../core/exercises';
import type { DateKey, MuscleGroup, PlannedSession } from '../../../core/types';
import { groupsOf, weekStart, type CarryLog } from './carry';

export const MUSCLE_GROUP_LABELS: Readonly<Record<MuscleGroup, string>> = {
  chest: 'Грудь',
  back: 'Спина',
  shoulders: 'Плечи',
  arms: 'Руки',
  legs: 'Ноги',
  glutes: 'Ягодицы',
  core: 'Кор',
  cardio: 'Кардио',
  mobility: 'Мобильность',
};

export interface BalanceRow {
  group: MuscleGroup;
  /** Sets planned for the week (the program's own exercises; carried copies are not plan). */
  plan: number;
  /** Sets done that week (journal). */
  fact: number;
  /** Fewer sets done than planned for the days already past (today included). */
  under: boolean;
}

export interface WeekBalance {
  weekStart: DateKey;
  rows: BalanceRow[];
}

/** «Баланс групп мышц»: this week and last week, plan and fact per group (Monday-first weeks). */
export function muscleBalance(
  sessions: PlannedSession[],
  logs: CarryLog[],
  today: DateKey,
): [WeekBalance, WeekBalance] {
  const current = weekStart(today);
  return [week(current, sessions, logs, today), week(shiftDateKey(current, -7), sessions, logs, today)];
}

function week(start: DateKey, sessions: PlannedSession[], logs: CarryLog[], today: DateKey): WeekBalance {
  const end = shiftDateKey(start, 6);
  const inWeek = (date: DateKey) => date >= start && date <= end;
  const plan = new Map<MuscleGroup, number>();
  const due = new Map<MuscleGroup, number>();
  const fact = new Map<MuscleGroup, number>();
  const add = (m: Map<MuscleGroup, number>, g: MuscleGroup, n: number) => m.set(g, (m.get(g) ?? 0) + n);
  for (const s of sessions) {
    if (!inWeek(s.date)) continue;
    for (const e of s.exercises) {
      if (e.carriedFrom) continue;
      for (const g of groupsOf(e)) {
        add(plan, g, e.sets);
        if (s.date <= today) add(due, g, e.sets);
      }
    }
  }
  for (const log of logs) {
    if (!inWeek(log.date)) continue;
    for (const e of log.exercises ?? []) for (const g of groupsOf(e)) add(fact, g, e.sets.length);
  }
  const rows = MUSCLE_GROUPS.filter((g) => plan.has(g) || fact.has(g)).map((g) => ({
    group: g,
    plan: plan.get(g) ?? 0,
    fact: fact.get(g) ?? 0,
    under: (fact.get(g) ?? 0) < (due.get(g) ?? 0),
  }));
  return { weekStart: start, rows };
}
