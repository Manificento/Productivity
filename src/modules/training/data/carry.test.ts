import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { saveWorkout } from '../../../core/logging/workout';
import { applyCarryOver, loadMuscleBalance, removeExercise } from './carry';
import { createProgram, replaceExercise, rescheduleSession, skipMissedSessions } from './programs';

// Program from Monday 2 Nov 2026: Mon rows + squats, Wed bench, Fri bench. Today: Tuesday 3 Nov.
const START = '2026-11-02';
const TODAY = '2026-11-03';
const normal = () => ({ deload: false, maxWorkoutIntensity: 'hard' as const });

async function setUp() {
  const program = await createProgram(
    {
      name: 'Сила',
      weeks: 2,
      days: [
        {
          weekday: 1,
          exercises: [
            { name: 'Тяга в наклоне', sets: 3, reps: 10 },
            { name: 'Приседания', sets: 3, reps: 8 },
          ],
        },
        { weekday: 3, exercises: [{ name: 'Жим лёжа', sets: 3, reps: 8 }] },
        { weekday: 5, exercises: [{ name: 'Жим лёжа', sets: 3, reps: 8 }] },
      ],
    },
    START,
    1_000,
  );
  await skipMissedSessions(TODAY, 1_000); // Monday was not done
  const byDate = async (date: string) =>
    (await db.plannedSessions.where('[programId+date]').equals([program.id, date]).first())!;
  return { program, byDate };
}

beforeEach(async () => {
  await Promise.all([db.programs.clear(), db.plannedSessions.clear(), db.workoutLogs.clear()]);
});

describe('carry-over data (#226)', () => {
  it('writes the carried exercises into the next session and marks the missed one; a second run adds nothing', async () => {
    const { byDate } = await setUp();
    expect(await applyCarryOver(TODAY, normal, 2_000)).toBe(2);
    const wed = await byDate('2026-11-04');
    expect(wed.exercises.map((e) => [e.name, e.sets, e.carriedFrom])).toEqual([
      ['Жим лёжа', 3, undefined],
      ['Тяга в наклоне', 2, '2026-11-02'],
      ['Приседания', 2, '2026-11-02'],
    ]);
    expect((await byDate('2026-11-02')).carriedOut).toEqual(['Тяга в наклоне', 'Приседания']);
    expect(await applyCarryOver(TODAY, normal, 3_000)).toBe(0);
    expect((await byDate('2026-11-04')).exercises).toHaveLength(3);
  });

  it('Given я вручную переношу или удаляю перенесённое упражнение When сохраняю Then автоматический перенос больше не возвращает его в эту сессию', async () => {
    const { byDate } = await setUp();
    await applyCarryOver(TODAY, normal, 2_000);
    const wed = await byDate('2026-11-04');
    await removeExercise(wed.id, 1, 3_000);
    expect((await byDate('2026-11-04')).exercises.map((e) => e.name)).toEqual(['Жим лёжа', 'Приседания']);
    await applyCarryOver(TODAY, normal, 4_000);
    expect((await byDate('2026-11-04')).exercises.map((e) => e.name)).toEqual(['Жим лёжа', 'Приседания']);

    // Moved by hand: the user moves Wednesday to Thursday — the carried squats go along and are not added again.
    await rescheduleSession(wed.id, '2026-11-05', TODAY, 5_000);
    await applyCarryOver(TODAY, normal, 6_000);
    expect((await byDate('2026-11-05')).exercises.map((e) => e.name)).toEqual(['Жим лёжа', 'Приседания']);
    expect(await db.plannedSessions.filter((s) => s.exercises.some((e) => e.carriedFrom)).count()).toBe(1);
  });

  it('removeExercise refuses a session that is not planned or an index that does not exist', async () => {
    const { byDate } = await setUp();
    await expect(removeExercise((await byDate('2026-11-02')).id, 0)).rejects.toThrow(/Сессия/);
    await expect(removeExercise((await byDate('2026-11-04')).id, 5)).rejects.toThrow(/Упражнение/);
    await expect(removeExercise('nope', 0)).rejects.toThrow(/Сессия/);
  });

  it('rescheduling the missed session itself brings it back whole and removes its carried copies', async () => {
    const { byDate } = await setUp();
    await applyCarryOver(TODAY, normal, 2_000);
    const monday = await byDate('2026-11-02');
    await rescheduleSession(monday.id, '2026-11-05', TODAY, 3_000);
    expect((await byDate('2026-11-04')).exercises.map((e) => e.name)).toEqual(['Жим лёжа']);
    const moved = await byDate('2026-11-05');
    expect(moved.status).toBe('planned');
    expect(moved.carriedOut).toBeUndefined();
  });

  it('archived programs are not carried; a workout of the group yesterday postpones the carry (48 h)', async () => {
    const { program, byDate } = await setUp();
    await saveWorkout({
      date: TODAY,
      type: 'Силовая',
      durationMin: 30,
      rpe: 6,
      exercises: [{ name: 'Подтягивания', sets: [{ reps: 8 }] }],
    });
    await applyCarryOver(TODAY, normal, 2_000);
    expect((await byDate('2026-11-04')).exercises.map((e) => e.name)).toEqual(['Жим лёжа', 'Приседания']);
    expect((await byDate('2026-11-06')).exercises.map((e) => e.name)).toEqual(['Жим лёжа', 'Тяга в наклоне']);

    await db.plannedSessions.clear();
    await db.programs.update(program.id, { archived: true });
    expect(await applyCarryOver(TODAY, normal)).toBe(0);
  });

  it('loads the balance of this and last week over active programs and the journal', async () => {
    await setUp();
    await saveWorkout({
      date: TODAY,
      type: 'Силовая',
      durationMin: 30,
      rpe: 6,
      exercises: [{ name: 'Жим лёжа', sets: [{ reps: 8 }, { reps: 8 }] }],
    });
    const [current, previous] = await loadMuscleBalance(TODAY);
    expect(current.weekStart).toBe('2026-11-02');
    expect(current.rows.find((r) => r.group === 'chest')).toMatchObject({ plan: 6, fact: 2 });
    expect(current.rows.find((r) => r.group === 'back')).toMatchObject({ plan: 3, fact: 0, under: true });
    expect(previous.rows).toEqual([]);
  });

  it("replacing an exercise drops muscle groups set for the old name; the journal gets the new name's groups", async () => {
    const { byDate } = await setUp();
    const wed = await byDate('2026-11-04');
    await db.plannedSessions.update(wed.id, {
      exercises: [{ name: 'Свой жим', sets: 3, muscleGroups: ['chest'] }],
    });
    await replaceExercise(wed.id, 0, 'Приседания', 2_000);
    const replaced = (await byDate('2026-11-04')).exercises[0]!;
    expect(replaced).toEqual({ name: 'Приседания', sets: 3 });
    const balanceAfter = await loadMuscleBalance(TODAY);
    expect(balanceAfter[0].rows.some((r) => r.group === 'legs')).toBe(true);
  });
});
