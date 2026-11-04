import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { saveWorkout, WorkoutInput } from './workout';

const TODAY = '2026-11-04';

beforeEach(async () => {
  await db.workoutLogs.clear();
});

describe('saveWorkout — the one write path for workoutLogs (ADR-0007)', () => {
  it('Given модули health и training When они сохраняют тренировку Then вызывают saveWorkout(), запись попадает в workoutLogs с id и временем', async () => {
    const saved = await saveWorkout(
      {
        date: TODAY,
        type: 'Силовая',
        durationMin: 50,
        rpe: 7,
        exercises: [{ name: 'Жим лёжа', sets: [{ reps: 10, weightKg: 60 }, { reps: 8 }] }],
        note: 'Хорошо',
      },
      1_000,
    );
    expect(saved.id).toMatch(/\S/);
    expect(saved).toMatchObject({
      date: TODAY,
      type: 'Силовая',
      durationMin: 50,
      rpe: 7,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect(await db.workoutLogs.get(saved.id)).toEqual(saved);
  });

  it('validates with zod: rejects RPE outside 1–10', async () => {
    await expect(saveWorkout({ date: TODAY, type: 'Бег', durationMin: 30, rpe: 11 })).rejects.toThrow(/RPE/);
    await expect(saveWorkout({ date: TODAY, type: 'Бег', durationMin: 30, rpe: 0 })).rejects.toThrow(/RPE/);
    expect(await db.workoutLogs.count()).toBe(0);
  });

  it('rejects a duration that is not 1…1440 whole minutes', async () => {
    await expect(saveWorkout({ date: TODAY, type: 'Бег', durationMin: 0, rpe: 5 })).rejects.toThrow(/минут/);
    await expect(saveWorkout({ date: TODAY, type: 'Бег', durationMin: 1_441, rpe: 5 })).rejects.toThrow(/минут/);
    await expect(saveWorkout({ date: TODAY, type: 'Бег', durationMin: 12.5, rpe: 5 })).rejects.toThrow(/минут/);
  });

  it('rejects an empty type and a date that is not a DateKey', async () => {
    await expect(saveWorkout({ date: TODAY, type: '  ', durationMin: 30, rpe: 5 })).rejects.toThrow(/тип/i);
    await expect(saveWorkout({ date: '2026-11-04T00:00:00Z', type: 'Бег', durationMin: 30, rpe: 5 })).rejects.toThrow(
      /дат/i,
    );
  });

  it('rejects exercises without a name or with negative sets', async () => {
    await expect(
      saveWorkout({ date: TODAY, type: 'Силовая', durationMin: 30, rpe: 5, exercises: [{ name: '', sets: [] }] }),
    ).rejects.toThrow(/упражнени/i);
    await expect(
      saveWorkout({
        date: TODAY,
        type: 'Силовая',
        durationMin: 30,
        rpe: 5,
        exercises: [{ name: 'Присед', sets: [{ reps: -1 }] }],
      }),
    ).rejects.toThrow();
    await expect(
      saveWorkout({
        date: TODAY,
        type: 'Силовая',
        durationMin: 30,
        rpe: 5,
        exercises: [{ name: 'Присед', sets: [{ weightKg: -5 }] }],
      }),
    ).rejects.toThrow();
  });

  it('WorkoutInput is exported so modules validate forms with the same schema', () => {
    expect(WorkoutInput.safeParse({ date: TODAY, type: 'Йога', durationMin: 20, rpe: 3 }).success).toBe(true);
  });
});
