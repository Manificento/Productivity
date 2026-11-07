import { describe, expect, it } from 'vitest';
import type { PlannedSession, ProgramDay } from '../../../core/types';
import { EXTEND_THRESHOLD_DAYS, extensionPlan, planEnd, rescheduleError, needsExtension } from './plan';

const days: ProgramDay[] = [
  { weekday: 1, exercises: [{ name: 'Присед', sets: 3 }] },
  { weekday: 3, exercises: [{ name: 'Жим', sets: 3 }] },
];
const s = (date: string, status: PlannedSession['status'] = 'planned', programId = 'p1'): PlannedSession =>
  ({
    id: `${programId}-${date}`,
    programId,
    date,
    exercises: [],
    status,
    createdAt: 0,
    updatedAt: 0,
  }) as PlannedSession;

describe('rescheduleError', () => {
  const all = [s('2026-11-03', 'skipped'), s('2026-11-09'), s('2026-11-02', 'planned', 'p2')];
  it('Given другой свободный день When переношу Then ошибки нет', () => {
    expect(rescheduleError(all[0]!, '2026-11-05', all, '2026-11-04')).toBeUndefined();
  });
  it('Given в этот день уже есть сессия той же программы Then ошибка — не больше одной в день', () => {
    expect(rescheduleError(all[0]!, '2026-11-09', all, '2026-11-04')).toMatch(/уже есть/);
  });
  it('a session of another program on that day does not block', () => {
    expect(rescheduleError(all[0]!, '2026-11-02', all, '2026-11-01')).toBeUndefined();
  });
  it('a past day or the same day is refused', () => {
    expect(rescheduleError(all[0]!, '2026-11-03', all, '2026-11-04')).toBeDefined();
    expect(rescheduleError(all[0]!, '2026-11-03', all, '2026-11-01')).toMatch(/другой день/);
  });
  it('a done session cannot be moved', () => {
    expect(rescheduleError(s('2026-11-03', 'done'), '2026-11-05', all, '2026-11-04')).toBeDefined();
  });
});

describe('plan end and extension', () => {
  const sessions = [s('2026-11-02'), s('2026-11-04'), s('2026-11-09', 'planned', 'p2')];
  it('planEnd is the last session date of the program', () => {
    expect(planEnd(sessions, 'p1')).toBe('2026-11-04');
    expect(planEnd(sessions, 'none')).toBeUndefined();
  });
  it('Given до конца плана меньше 7 дней Then нужно продление; ровно 7 — нет', () => {
    expect(EXTEND_THRESHOLD_DAYS).toBe(7);
    expect(needsExtension('2026-11-10', '2026-11-04')).toBe(true); // 6 days left
    expect(needsExtension('2026-11-11', '2026-11-04')).toBe(false); // 7 days left
    expect(needsExtension('2026-11-04', '2026-11-04')).toBe(true);
    expect(needsExtension('2026-11-03', '2026-11-04')).toBe(true); // already over
  });
  it('extension continues the same weekdays for 4 weeks after the plan end, no duplicates', () => {
    const plan = extensionPlan(days, [s('2026-11-02'), s('2026-11-04')], '2026-11-04', 4);
    expect(plan.map((d) => d.date)).toEqual([
      '2026-11-09',
      '2026-11-11',
      '2026-11-16',
      '2026-11-18',
      '2026-11-23',
      '2026-11-25',
      '2026-11-30',
      '2026-12-02',
    ]);
  });
  it('an ended plan is extended from today, not from the old end', () => {
    const plan = extensionPlan(days, [s('2026-10-12')], '2026-11-04', 1);
    expect(plan.map((d) => d.date)).toEqual(['2026-11-04', '2026-11-09']);
  });
  it('a plan that still runs is continued after its last session, even a moved one', () => {
    const plan = extensionPlan(days, [s('2026-11-02'), s('2026-11-11')], '2026-11-04', 1);
    expect(plan.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-18']);
  });
});
