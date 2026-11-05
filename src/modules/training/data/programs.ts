import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import { saveWorkout, type WorkoutInput } from '../../../core/logging/workout';
import type { DateKey, PlannedSession, Program, WorkoutLog } from '../../../core/types';
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

/**
 * Finishes a session: the workout goes to the journal ONLY through `saveWorkout()`, and the session becomes
 * `done` with `workoutLogId` — in one transaction, so a failure leaves neither half.
 */
export async function completeSession(sessionId: string, workout: WorkoutInput, now = Date.now()): Promise<WorkoutLog> {
  return db.transaction('rw', db.workoutLogs, db.plannedSessions, async () => {
    const session = await db.plannedSessions.get(sessionId);
    if (!session) throw new Error('Сессия не найдена');
    if (session.status === 'done') throw new Error('Сессия уже выполнена');
    const log = await saveWorkout(workout, now);
    await db.plannedSessions.update(sessionId, touch({ status: 'done' as const, workoutLogId: log.id }, now));
    return log;
  });
}

/** Sessions of earlier days that were never done become `skipped`; the plan is not shifted. */
export async function skipMissedSessions(today: DateKey, now = Date.now()): Promise<void> {
  await db.plannedSessions
    .where('date')
    .below(today)
    .filter((s) => s.status === 'planned')
    .modify((s) => {
      s.status = 'skipped';
      s.updatedAt = now;
    });
}

/** Replaces one exercise by name in THIS session only (the session holds its own copy; the program is untouched). */
export async function replaceExercise(sessionId: string, index: number, name: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.plannedSessions, async () => {
    const session = await db.plannedSessions.get(sessionId);
    if (!session?.exercises[index]) throw new Error('Упражнение не найдено');
    const exercises = session.exercises.map((e, i) => (i === index ? { ...e, name } : e));
    await db.plannedSessions.update(sessionId, touch({ exercises }, now));
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
