import { describe, expect, it } from 'vitest';
import type { PlannedSession } from '../../../core/types';
import { muscleBalance, MUSCLE_GROUP_LABELS } from './balance';

const s = (date: string, exercises: PlannedSession['exercises'], status: PlannedSession['status'] = 'planned') =>
  ({ id: date, createdAt: 0, updatedAt: 0, programId: 'p1', date, exercises, status }) as PlannedSession;

describe('muscleBalance', () => {
  it('Given экран программы When открываю «Баланс групп мышц» Then вижу за текущую и прошлую неделю план и факт по каждой группе, недотренированные выделены', () => {
    const sessions = [
      // Last week (Oct 26 – Nov 1): back and legs planned, only back done.
      s('2026-10-26', [{ name: 'Тяга в наклоне', sets: 3 }], 'done'),
      s('2026-10-28', [{ name: 'Приседания', sets: 3 }], 'skipped'),
      // This week (Nov 2 – 8): carried copies are not plan.
      s('2026-11-02', [{ name: 'Жим лёжа', sets: 3 }], 'done'),
      s('2026-11-06', [
        { name: 'Приседания', sets: 3 },
        { name: 'Тяга в наклоне', sets: 2, carriedFrom: '2026-10-28' },
      ]),
    ];
    const logs = [
      { date: '2026-10-26', exercises: [{ name: 'Тяга в наклоне', sets: [{}, {}, {}] }] },
      { date: '2026-11-02', exercises: [{ name: 'Жим лёжа', sets: [{}, {}] }] },
      { date: '2026-11-03', exercises: [{ name: 'Свой комплекс', sets: [{}], muscleGroups: ['core' as const] }] },
    ];
    const [current, previous] = muscleBalance(sessions, logs, '2026-11-04');

    expect(previous!.weekStart).toBe('2026-10-26');
    expect(previous!.rows.find((r) => r.group === 'back')).toEqual({ group: 'back', plan: 3, fact: 3, under: false });
    expect(previous!.rows.find((r) => r.group === 'legs')).toEqual({ group: 'legs', plan: 3, fact: 0, under: true });

    expect(current!.weekStart).toBe('2026-11-02');
    // Chest: 3 planned on Monday, 2 done → under. Legs: planned on Friday, still ahead → not under yet.
    expect(current!.rows.find((r) => r.group === 'chest')).toEqual({ group: 'chest', plan: 3, fact: 2, under: true });
    expect(current!.rows.find((r) => r.group === 'legs')).toEqual({ group: 'legs', plan: 3, fact: 0, under: false });
    // A group done without a plan still shows; a group neither planned nor done does not.
    expect(current!.rows.find((r) => r.group === 'core')).toMatchObject({ plan: 3, fact: 1 });
    expect(current!.rows.some((r) => r.group === 'mobility')).toBe(false);
    expect(MUSCLE_GROUP_LABELS.back).toBe('Спина');
  });

  it('no plan and no workouts: empty weeks', () => {
    const [current, previous] = muscleBalance([], [], '2026-11-04');
    expect(current!.rows).toEqual([]);
    expect(previous!.rows).toEqual([]);
  });
});
