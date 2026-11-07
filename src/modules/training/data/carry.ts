import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { touch } from '../../../core/ids';
import type { DateKey } from '../../../core/types';
import { muscleBalance, type WeekBalance } from '../logic/balance';
import { CARRY_HORIZON_DAYS, CARRY_LOOKBACK_DAYS, planCarryOver, weekStart, type CarryTargets } from '../logic/carry';

/** Writes `plannedSessions` (owner: training): carried exercises and the `carriedOut` marks (#226). */

const activeProgramIds = async () => new Set((await db.programs.toArray()).filter((p) => !p.archived).map((p) => p.id));

/**
 * Applies the carry-over (`planCarryOver`) for today: appends carried exercises to the next sessions and marks
 * the missed ones, in one transaction — a second run (another tab, a re-render) finds them marked and adds
 * nothing. Returns how many exercises were added.
 */
export async function applyCarryOver(
  today: DateKey,
  targetsOn: (date: DateKey) => CarryTargets | undefined,
  now = Date.now(),
): Promise<number> {
  // Whole weeks around the window: the weekly cap counts every session of a week.
  const from = weekStart(shiftDateKey(today, -CARRY_LOOKBACK_DAYS));
  const to = shiftDateKey(weekStart(shiftDateKey(today, CARRY_HORIZON_DAYS)), 6);
  return db.transaction('rw', db.programs, db.plannedSessions, db.workoutLogs, async () => {
    const active = await activeProgramIds();
    const sessions = (await db.plannedSessions.where('date').between(from, to, true, true).toArray()).filter((s) =>
      active.has(s.programId),
    );
    if (sessions.length === 0) return 0;
    const logs = await db.workoutLogs.where('date').between(shiftDateKey(from, -7), today, true, true).toArray();
    const plan = planCarryOver({ sessions, logs, targetsOn, today });
    const byId = new Map(sessions.map((s) => [s.id, s]));
    const changed = new Set<string>();
    for (const { sessionId, exercise } of plan.additions) {
      const s = byId.get(sessionId)!;
      s.exercises = [...s.exercises, exercise];
      changed.add(sessionId);
    }
    for (const { sessionId, names } of plan.handled) {
      const s = byId.get(sessionId)!;
      s.carriedOut = [...(s.carriedOut ?? []), ...names];
      changed.add(sessionId);
    }
    for (const id of changed) {
      const s = byId.get(id)!;
      await db.plannedSessions.put({ ...s, updatedAt: now });
    }
    return plan.additions.length;
  });
}

/**
 * Removes one exercise from a planned session (e.g. a carried one the user does not want). A carried exercise is
 * already in its missed session's `carriedOut`, so the carry-over does not bring it back.
 */
export async function removeExercise(sessionId: string, index: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.plannedSessions, async () => {
    const session = await db.plannedSessions.get(sessionId);
    if (!session || session.status !== 'planned') throw new Error('Сессия не найдена');
    if (!session.exercises[index]) throw new Error('Упражнение не найдено');
    const exercises = session.exercises.filter((_, i) => i !== index);
    await db.plannedSessions.update(sessionId, touch({ exercises }, now));
  });
}

/** «Баланс групп мышц»: plan and fact of this and last week over active programs and the journal. */
export async function loadMuscleBalance(today: DateKey): Promise<[WeekBalance, WeekBalance]> {
  const from = shiftDateKey(weekStart(today), -7);
  const to = shiftDateKey(weekStart(today), 6);
  const [active, sessions, logs] = await Promise.all([
    activeProgramIds(),
    db.plannedSessions.where('date').between(from, to, true, true).toArray(),
    db.workoutLogs.where('date').between(from, to, true, true).toArray(),
  ]);
  return muscleBalance(
    sessions.filter((s) => active.has(s.programId)),
    logs,
    today,
  );
}

export function useMuscleBalance(today: DateKey): [WeekBalance, WeekBalance] | undefined {
  return useLiveQuery(() => loadMuscleBalance(today), [today]);
}
