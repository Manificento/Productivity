import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { loadDailyTargets } from './useDailyTargets';

const base = { createdAt: 0, updatedAt: 0 };
const night = (date: string, hours: number) => {
  const wakeTime = new Date(`${date}T07:00:00`).getTime();
  return { id: date, date, bedtime: wakeTime - hours * 3600_000, wakeTime, quality: 3, ...base };
};

afterEach(async () => {
  await Promise.all([db.sleepLogs.clear(), db.workoutLogs.clear()]);
});

describe('loadDailyTargets', () => {
  it('loads the last three nights of sleep for the sleep-debt rule', async () => {
    await db.sleepLogs.bulkAdd([night('2026-11-02', 6), night('2026-11-03', 6.2), night('2026-11-04', 6.4)]);
    const t = await loadDailyTargets('2026-11-04');
    expect(t.bedtime).toBe('23:00');
  });

  it('loads yesterday’s hardest workout', async () => {
    await db.workoutLogs.bulkAdd([
      { id: 'w1', date: '2026-11-03', type: 'Сила', durationMin: 60, rpe: 9, ...base },
      { id: 'w2', date: '2026-11-03', type: 'Бег', durationMin: 20, rpe: 4, ...base },
      { id: 'w3', date: '2026-11-04', type: 'Бег', durationMin: 20, rpe: 10, ...base },
    ]);
    expect((await loadDailyTargets('2026-11-04')).maxWorkoutIntensity).toBe('moderate');
    expect((await loadDailyTargets('2026-11-05')).maxWorkoutIntensity).toBe('moderate');
    expect((await loadDailyTargets('2026-11-06')).maxWorkoutIntensity).toBe('hard');
  });
});
