import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/db';
import { loadRecentWorkouts, saveWorkout } from './workouts';

const TODAY = '2026-11-04';

beforeEach(async () => {
  await db.workoutLogs.clear();
});

describe('workouts data', () => {
  it('Given the form When I save Then the workout is stored with its exercises', async () => {
    const saved = await saveWorkout(
      {
        date: TODAY,
        type: 'Силовая',
        durationMin: 50,
        rpe: 7,
        exercises: [{ name: 'Жим лёжа', sets: [{ reps: 10, weightKg: 60 }] }],
      },
      1_000,
    );
    expect(await db.workoutLogs.get(saved.id)).toMatchObject({
      date: TODAY,
      type: 'Силовая',
      durationMin: 50,
      rpe: 7,
      exercises: [{ name: 'Жим лёжа', sets: [{ reps: 10, weightKg: 60 }] }],
      createdAt: 1_000,
    });
  });

  it('history: last 60 days, newest first, latest saved first within a day', async () => {
    await saveWorkout({ date: '2026-11-03', type: 'Бег', durationMin: 30, rpe: 5 }, 1);
    await saveWorkout({ date: TODAY, type: 'Йога', durationMin: 20, rpe: 3 }, 2);
    await saveWorkout({ date: TODAY, type: 'Бег', durationMin: 40, rpe: 6 }, 3);
    await saveWorkout({ date: '2026-09-05', type: 'Бег', durationMin: 40, rpe: 6 }, 4); // 60 days back + 1
    const list = await loadRecentWorkouts(TODAY);
    expect(list.map((w) => `${w.date} ${w.type}`)).toEqual(['2026-11-04 Бег', '2026-11-04 Йога', '2026-11-03 Бег']);
  });
});
