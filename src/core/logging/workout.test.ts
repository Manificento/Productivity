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

  it('rejects a calendar day that does not exist (2026-13-45, 2026-02-30)', async () => {
    await expect(saveWorkout({ date: '2026-13-45', type: 'Бег', durationMin: 30, rpe: 5 })).rejects.toThrow(/календар/);
    await expect(saveWorkout({ date: '2026-02-30', type: 'Бег', durationMin: 30, rpe: 5 })).rejects.toThrow(/календар/);
    expect(await db.workoutLogs.count()).toBe(0);
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

  describe('imported workouts (#215)', () => {
    const imported = {
      date: TODAY,
      type: 'Бег',
      durationMin: 31,
      rpe: 5,
      sourceId: 'com.strava',
      externalId: 'hk-run-1',
    };

    it('Given WorkoutInput / WorkoutLog в ядре When модуль передаёт externalId и sourceId из readWorkouts() Then они сохраняются в записи', async () => {
      const saved = await saveWorkout(imported, 1_000);
      expect(await db.workoutLogs.get(saved.id)).toMatchObject({ sourceId: 'com.strava', externalId: 'hk-run-1' });
    });

    it('Given тренировка с тем же externalId уже записана When вызывается saveWorkout() Then запись обновляется, а не добавляется вторая', async () => {
      const first = await saveWorkout(imported, 1_000);
      // The user rated the workout in the app; the store later reports a corrected duration.
      await db.workoutLogs.update(first.id, { rpe: 8, note: 'Тяжело' });
      const again = await saveWorkout({ ...imported, durationMin: 33, rpe: 5 }, 2_000);
      expect(again.id).toBe(first.id);
      expect(await db.workoutLogs.count()).toBe(1);
      // Store-owned fields follow the store; what the user entered in the app stays.
      expect(await db.workoutLogs.get(first.id)).toMatchObject({
        durationMin: 33,
        rpe: 8,
        note: 'Тяжело',
        createdAt: 1_000,
        updatedAt: 2_000,
      });
    });

    it('a re-import without changes writes nothing', async () => {
      const first = await saveWorkout(imported, 1_000);
      expect(await saveWorkout(imported, 2_000)).toEqual(first);
      expect((await db.workoutLogs.get(first.id))?.updatedAt).toBe(1_000);
    });

    it('the same id from another app is another workout', async () => {
      await saveWorkout(imported);
      await saveWorkout({ ...imported, sourceId: 'com.garmin' });
      expect(await db.workoutLogs.count()).toBe(2);
    });

    it('Given тренировка введена вручную (без externalId) When вызывается saveWorkout() Then поведение как сейчас — новая запись', async () => {
      const manual = { date: TODAY, type: 'Бег', durationMin: 30, rpe: 6 };
      await saveWorkout(manual);
      await saveWorkout(manual);
      expect(await db.workoutLogs.count()).toBe(2);
      expect(
        (await db.workoutLogs.toArray()).every((w) => w.externalId === undefined && w.sourceId === undefined),
      ).toBe(true);
    });

    it('externalId and sourceId come together and are not empty', async () => {
      await expect(saveWorkout({ ...imported, sourceId: undefined })).rejects.toThrow(/источник/i);
      await expect(saveWorkout({ ...imported, externalId: undefined })).rejects.toThrow(/источник/i);
      await expect(saveWorkout({ ...imported, externalId: '  ' })).rejects.toThrow();
      expect(await db.workoutLogs.count()).toBe(0);
    });
  });
});
