import { daysBetween, shiftDateKey } from '../../../core/dates';
import type { DateKey, PlannedSession, ProgramDay } from '../../../core/types';
import { planSessions, type PlannedDay } from './programs';

/** The «extend plan» card appears when fewer than this many days remain. */
export const EXTEND_THRESHOLD_DAYS = 7;
export const EXTEND_WEEKS = 4;

/** Why `session` cannot move to `date` (undefined = fine). One session per program per day. */
export function rescheduleError(
  session: PlannedSession,
  date: DateKey,
  all: PlannedSession[],
  today: DateKey,
): string | undefined {
  if (session.status === 'done') return 'Выполненную сессию перенести нельзя';
  if (date < today || date === session.date) return 'Выберите другой день — не раньше сегодняшнего';
  if (all.some((x) => x.programId === session.programId && x.date === date && x.id !== session.id))
    return 'В этот день уже есть сессия этой программы';
  return undefined;
}

/** Date of the program's last session (done, skipped or planned), or undefined. */
export function planEnd(sessions: PlannedSession[], programId: string): DateKey | undefined {
  let end: DateKey | undefined;
  for (const s of sessions) if (s.programId === programId && (end === undefined || s.date > end)) end = s.date;
  return end;
}

/** Fewer than 7 days to the end of the plan (the end day counts), or the plan is already over. */
export function needsExtension(end: DateKey, today: DateKey): boolean {
  const left = daysBetween(today, end);
  return left < EXTEND_THRESHOLD_DAYS;
}

/**
 * New sessions for `weeks` more weeks on the same weekdays: from the day after the plan end
 * (from today if the plan is already over). Days that already hold a session of the program are left out.
 */
export function extensionPlan(
  days: ProgramDay[],
  existing: PlannedSession[],
  today: DateKey,
  weeks: number,
): PlannedDay[] {
  let end: DateKey | undefined;
  for (const s of existing) if (end === undefined || s.date > end) end = s.date;
  const start = end !== undefined && end >= today ? shiftDateKey(end, 1) : today;
  const taken = new Set(existing.map((s) => s.date));
  return planSessions(days, start, weeks).filter((d) => !taken.has(d.date));
}
