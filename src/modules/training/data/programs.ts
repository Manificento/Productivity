import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import type { DateKey, PlannedSession, Program } from '../../../core/types';
import { planSessions, sessionOn, type ProgramInput } from '../logic/programs';

/** Writes `programs` and `plannedSessions` (owner: training). The workout log goes only through saveWorkout(). */

/** A program and its 4-week plan, written atomically. The plan starts today. */
export async function createProgram(input: ProgramInput, today: DateKey, now = Date.now()): Promise<Program> {
  const program: Program = newRecord({ name: input.name, archived: false, days: input.days, weeks: input.weeks }, now);
  const sessions: PlannedSession[] = planSessions(input.days, today, input.weeks).map((d) =>
    newRecord({ programId: program.id, date: d.date, exercises: d.exercises, status: 'planned' as const }, now),
  );
  await db.transaction('rw', db.programs, db.plannedSessions, async () => {
    await db.programs.add(program);
    await db.plannedSessions.bulkAdd(sessions);
  });
  return program;
}

/** Archives a program and removes its future planned sessions (after `today`); the workout log is untouched. */
export async function archiveProgram(id: string, today: DateKey, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.programs, db.plannedSessions, async () => {
    await db.programs.update(id, touch({ archived: true }, now));
    await db.plannedSessions
      .where('programId')
      .equals(id)
      .filter((s) => s.date > today && s.status === 'planned')
      .delete();
  });
}

export async function loadActivePrograms(): Promise<Program[]> {
  const all = await db.programs.toArray();
  return all.filter((p) => !p.archived).sort((a, b) => a.createdAt - b.createdAt);
}

export type TodaySession = { rest: true; ended?: boolean } | { rest: false; program: Program; session: PlannedSession };

/** Today's session of the first active program that has one; `{ rest: true }` if programs exist but none today. */
export async function loadTodaySession(today: DateKey): Promise<TodaySession | undefined> {
  const programs = await loadActivePrograms();
  if (programs.length === 0) return undefined;
  const sessions = await db.plannedSessions.where('date').equals(today).toArray();
  for (const program of programs) {
    const session = sessionOn(
      sessions.filter((s) => s.programId === program.id),
      today,
    );
    if (session) return { rest: false, program, session };
  }
  // Nothing today: a day off, or the plan is over (no session after today either).
  const upcoming = await db.plannedSessions.where('date').above(today).count();
  return { rest: true, ended: upcoming === 0 };
}

export function useActivePrograms(): Program[] | undefined {
  return useLiveQuery(loadActivePrograms, []);
}

export function useTodaySession(today: DateKey): TodaySession | undefined | null {
  // `null` while loading, `undefined` when there is no active program.
  return useLiveQuery(async () => await loadTodaySession(today), [today], null);
}
