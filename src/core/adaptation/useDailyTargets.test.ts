import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { db } from '../db';
import type { Habit } from '../types';
import { loadAdaptationContext, loadDailyTargets } from './useDailyTargets';

const base = { createdAt: 0, updatedAt: 0 };
const night = (date: string, hours: number) => {
  const wakeTime = new Date(`${date}T07:00:00`).getTime();
  return { id: date, date, bedtime: wakeTime - hours * 3600_000, wakeTime, quality: 3, ...base };
};

afterEach(async () => {
  await Promise.all(
    [db.sleepLogs, db.workoutLogs, db.settings, db.weightLogs, db.cognitiveTests, db.meditationSessions].map((t) =>
      t.clear(),
    ),
  );
});

describe('loadDailyTargets', () => {
  it('loads the last three nights of sleep for the sleep-debt rule', async () => {
    await db.sleepLogs.bulkAdd([night('2026-11-02', 6), night('2026-11-03', 6.2), night('2026-11-04', 6.4)]);
    const t = await loadDailyTargets('2026-11-04');
    expect(t.bedtime).toBe('23:00');
  });

  it('ignores a short night older than three days', async () => {
    await db.sleepLogs.bulkAdd([night('2026-11-01', 5), night('2026-11-02', 6), night('2026-11-03', 6)]);
    expect((await loadDailyTargets('2026-11-04')).bedtime).toBe('23:30');
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

  it('Given контекст без данных о весе и цели питания When считаются цели Then kcal, proteinG, fatG, carbsG — undefined', async () => {
    const t = await loadDailyTargets('2026-11-04');
    expect([t.kcal, t.proteinG, t.fatG, t.carbsG]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('loads the v2 context: nutrition settings, latest weight, PVT medians of 14 days, meditation yesterday', async () => {
    await db.settings.bulkPut([
      { key: 'nutrition.expenditure', value: { kcal: 2500, updatedAt: 0 } },
      { key: 'nutrition.goal', value: { kind: 'lose', ratePct: 0.5 } },
    ]);
    await db.weightLogs.bulkAdd([
      { id: 'w1', date: '2026-10-30', kg: 81, ...base },
      { id: 'w2', date: '2026-11-02', kg: 80, ...base },
      { id: 'w3', date: '2026-11-05', kg: 79, ...base }, // after the day: ignored
    ]);
    const pvt = (id: string, date: string, medianRtMs: number) => ({
      id,
      date,
      kind: 'pvt' as const,
      startedAt: 0,
      durationMs: 60_000,
      reactionTimesMs: [medianRtMs],
      medianRtMs,
      lapses: 0,
      falseStarts: 0,
      ...base,
    });
    await db.cognitiveTests.bulkAdd([
      pvt('p1', '2026-11-04', 270),
      pvt('p2', '2026-11-01', 320),
      pvt('p3', '2026-10-15', 500), // older than 14 days
      pvt('p4', '2026-10-22', 300), // 13 days before: the oldest day of the window
      pvt('p5', '2026-10-21', 400), // 14 days before: outside
    ]);
    const meditation = (id: string, date: string, durationMin: number) => ({
      id,
      date,
      startedAt: 0,
      durationMin,
      kind: 'focus' as const,
      completed: true,
      ...base,
    });
    await db.meditationSessions.bulkAdd([
      meditation('m1', '2026-11-03', 10),
      meditation('m2', '2026-11-03', 5),
      meditation('m3', '2026-11-04', 20),
    ]);

    const ctx = await loadAdaptationContext('2026-11-04');
    expect(ctx).toMatchObject({
      expenditureKcal: 2500,
      nutritionGoal: { kind: 'lose', ratePct: 0.5 },
      weightKg: 80,
      recentPvtMediansMs: [270, 320, 300],
      meditationMinYesterday: 15,
    });
    expect((await loadDailyTargets('2026-11-04')).kcal).toBe(2060);
  });

  it('ignores malformed nutrition settings instead of producing NaN targets', async () => {
    await db.weightLogs.add({ id: 'w', date: '2026-11-01', kg: 80, ...base });
    for (const [expenditure, goal] of [
      [{ kcal: 2500 }, { kind: 'lose' }], // no ratePct
      [{ kcal: 2500 }, { kind: 'lose', ratePct: -1 }],
      [{ kcal: 2500 }, { kind: 'cut', ratePct: 0.5 }],
      [{ kcal: Number.NaN }, { kind: 'lose', ratePct: 0.5 }],
      [{ kcal: 0 }, { kind: 'lose', ratePct: 0.5 }],
    ]) {
      await db.settings.bulkPut([
        { key: 'nutrition.expenditure', value: expenditure },
        { key: 'nutrition.goal', value: goal },
      ]);
      const t = await loadDailyTargets('2026-11-04');
      expect(t.kcal).toBeUndefined();
    }
  });

  it('ignores a non-positive weight', async () => {
    await db.settings.bulkPut([
      { key: 'nutrition.expenditure', value: { kcal: 2500 } },
      { key: 'nutrition.goal', value: { kind: 'lose', ratePct: 0.5 } },
    ]);
    await db.weightLogs.add({ id: 'w0', date: '2026-11-01', kg: 0, ...base });
    expect((await loadDailyTargets('2026-11-04')).kcal).toBeUndefined();
  });

  it('Given Habit When я читаю src/core/types.ts Then есть поле essential?: boolean', () => {
    expectTypeOf<Habit['essential']>().toEqualTypeOf<boolean | undefined>();
  });
});
