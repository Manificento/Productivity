import { useLiveQuery } from 'dexie-react-hooks';
import { db, softDeleteMany } from '../../../core/db';
import { newRecord, touch } from '../../../core/ids';
import { saveWorkout, type WorkoutInput } from '../../../core/logging/workout';
import type { DateKey, PlannedSession, Program, WorkoutLog } from '../../../core/types';
import { shiftDateKey } from '../../../core/dates';
import { EXTEND_WEEKS, extensionPlan, needsExtension, planEnd, rescheduleError } from '../logic/plan';
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
    const future = await db.plannedSessions
      .where('programId')
      .equals(id)
      .filter((s) => s.date > today && s.status === 'planned')
      .primaryKeys();
    await softDeleteMany(db.plannedSessions, future, now);
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
    if (session.status !== 'planned') throw new Error('Сессия уже закрыта');
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
    // Groups set for the old name do not fit the new one: it falls back to `muscleGroupsOf(name)`.
    const exercises = session.exercises.map((e, i) => {
      if (i !== index) return e;
      const { muscleGroups: _old, ...rest } = e;
      return e.name === name ? e : { ...rest, name };
    });
    await db.plannedSessions.update(sessionId, touch({ exercises }, now));
  });
}

/**
 * Moves a session to another day: the date changes and the status is `planned` again; at most one session per program
 * per day. A missed session brought back whole takes back what was carried from it: its carried copies leave the
 * planned sessions and `carriedOut` is cleared (#226). A copy already done stays done — the session comes back whole
 * all the same (the user moved it on purpose).
 */
export async function rescheduleSession(
  sessionId: string,
  date: DateKey,
  today: DateKey,
  now = Date.now(),
): Promise<void> {
  await db.transaction('rw', db.plannedSessions, async () => {
    const session = await db.plannedSessions.get(sessionId);
    if (!session) throw new Error('Сессия не найдена');
    const siblings = await db.plannedSessions.where('programId').equals(session.programId).toArray();
    const error = rescheduleError(session, date, siblings, today);
    if (error) throw new Error(error);
    if (session.status === 'skipped' && session.carriedOut) {
      for (const s of siblings) {
        if (s.status !== 'planned' || !s.exercises.some((e) => e.carriedFrom === session.date)) continue;
        const exercises = s.exercises.filter((e) => e.carriedFrom !== session.date);
        await db.plannedSessions.update(s.id, touch({ exercises }, now));
      }
    }
    await db.plannedSessions.update(sessionId, touch({ date, status: 'planned' as const, carriedOut: undefined }, now));
  });
}

/**
 * Adds `EXTEND_WEEKS` weeks on the program's own weekdays after its last session; returns how many sessions were added.
 * Idempotent: the need (under 7 days left, or the plan is over) is re-checked inside the transaction, so a double tap adds nothing.
 */
export async function extendProgram(programId: string, today: DateKey, now = Date.now()): Promise<number> {
  return db.transaction('rw', db.programs, db.plannedSessions, async () => {
    const program = await db.programs.get(programId);
    if (!program || program.archived) throw new Error('Программа не найдена');
    const existing = await db.plannedSessions.where('programId').equals(programId).toArray();
    const end = planEnd(existing, programId);
    if (end !== undefined && !needsExtension(end, today)) return 0;
    const added = extensionPlan(program.days, existing, today, EXTEND_WEEKS).map((d) =>
      newRecord({ programId, date: d.date, exercises: d.exercises, status: 'planned' as const }, now),
    );
    await db.plannedSessions.bulkAdd(added);
    return added.length;
  });
}

/** Extends every active program whose plan is over (last session before `today`); returns how many programs grew. */
export async function extendEndedPrograms(today: DateKey, now = Date.now()): Promise<number> {
  const ends = await loadPlanEnds();
  let grown = 0;
  for (const [id, end] of ends) if (end < today && (await extendProgram(id, today, now)) > 0) grown++;
  return grown;
}

/** Last session date of each active program that has a plan. */
export async function loadPlanEnds(): Promise<Map<string, DateKey>> {
  const [programs, sessions] = await Promise.all([loadActivePrograms(), db.plannedSessions.toArray()]);
  const ends = new Map<string, DateKey>();
  for (const p of programs) {
    const end = planEnd(sessions, p.id);
    if (end) ends.set(p.id, end);
  }
  return ends;
}

/** «Пропущена»: skipped sessions of active programs from the last two weeks, oldest first. */
export async function loadMissedSessions(today: DateKey): Promise<PlannedSession[]> {
  const [sessions, programs] = await Promise.all([
    db.plannedSessions.where('date').between(shiftDateKey(today, -14), today, true, false).toArray(),
    loadActivePrograms(),
  ]);
  const active = new Set(programs.map((p) => p.id));
  return sessions
    .filter((s) => s.status === 'skipped' && active.has(s.programId))
    .sort((a, b) => a.date.localeCompare(b.date));
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

/** Planned (not yet done) sessions of active programs from `from` to `to` inclusive, by date. */
export async function loadUpcomingSessions(from: DateKey, to: DateKey): Promise<PlannedSession[]> {
  const [sessions, programs] = await Promise.all([
    db.plannedSessions.where('date').between(from, to, true, true).toArray(),
    loadActivePrograms(),
  ]);
  const active = new Set(programs.map((p) => p.id));
  return sessions
    .filter((s) => s.status === 'planned' && active.has(s.programId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function useUpcomingSessions(from: DateKey, to: DateKey): PlannedSession[] | undefined {
  return useLiveQuery(() => loadUpcomingSessions(from, to), [from, to]);
}

export function useMissedSessions(today: DateKey): PlannedSession[] | undefined {
  return useLiveQuery(() => loadMissedSessions(today), [today]);
}

export function usePlanEnds(): Map<string, DateKey> | undefined {
  return useLiveQuery(loadPlanEnds, []);
}

export function useActivePrograms(): Program[] | undefined {
  return useLiveQuery(loadActivePrograms, []);
}

export function useTodaySession(today: DateKey): TodaySession | undefined | null {
  // `null` while loading, `undefined` when there is no active program.
  return useLiveQuery(async () => await loadTodaySession(today), [today], null);
}
