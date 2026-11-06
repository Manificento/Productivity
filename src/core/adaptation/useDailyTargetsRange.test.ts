import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { shiftDateKey } from '../dates';
import type { LifeEvent } from '../types';
import { loadDailyTargets, loadDailyTargetsRange, MAX_RANGE_DAYS, useDailyTargetsRange } from './useDailyTargets';

const base = { createdAt: 0, updatedAt: 0 };
const night = (date: string, hours: number) => {
  const wakeTime = new Date(`${date}T07:00:00`).getTime();
  return { id: date, date, bedtime: wakeTime - hours * 3600_000, wakeTime, quality: 3, ...base };
};
const exam: LifeEvent = {
  id: 'exam',
  title: 'IELTS',
  type: 'exam',
  date: '2026-11-09',
  importance: 3,
  prepDays: 7,
  ...base,
};

/** A bit of every kind of data the engine reads, spread over and around 1–14 Nov 2026. */
async function seed() {
  await db.lifeEvents.bulkAdd([
    exam,
    { ...exam, id: 'later', title: 'Дедлайн', date: '2026-12-20', importance: 1, prepDays: 3 },
  ]);
  await db.sleepLogs.bulkAdd([
    night('2026-10-31', 5),
    night('2026-11-01', 6),
    night('2026-11-02', 6.2),
    night('2026-11-06', 8),
  ]);
  await db.checkIns.add({ id: 'c1', date: '2026-11-03', energy: 1, focus: 3, ...base });
  await db.workoutLogs.bulkAdd([
    { id: 'w1', date: '2026-10-31', type: 'Сила', durationMin: 60, rpe: 9, ...base },
    { id: 'w2', date: '2026-11-10', type: 'Сила', durationMin: 60, rpe: 8, ...base },
  ]);
  await db.settings.bulkPut([
    { key: 'nutrition.expenditure', value: { kcal: 2500, updatedAt: 0 } },
    { key: 'nutrition.goal', value: { kind: 'lose', ratePct: 0.5 } },
    { key: 'adaptation.baseline', value: { taskCapacityMin: 300 } },
  ]);
  await db.weightLogs.bulkAdd([
    { id: 'kg1', date: '2026-10-20', kg: 82, ...base },
    { id: 'kg2', date: '2026-11-05', kg: 80, ...base },
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
  await db.cognitiveTests.bulkAdd(
    Array.from({ length: 8 }, (_, i) => pvt(`p${i}`, shiftDateKey('2026-10-24', i), 250)).concat(
      pvt('slow', '2026-11-04', 400),
    ),
  );
  await db.meditationSessions.add({
    id: 'm1',
    date: '2026-11-07',
    startedAt: 0,
    durationMin: 20,
    kind: 'focus',
    completed: true,
    ...base,
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    [
      db.lifeEvents,
      db.sleepLogs,
      db.checkIns,
      db.workoutLogs,
      db.settings,
      db.weightLogs,
      db.cognitiveTests,
      db.meditationSessions,
    ].map((t) => t.clear()),
  );
});

describe('loadDailyTargetsRange', () => {
  it('Given даты from..to до 31 дня When загружаются цели диапазона Then по дню — те же цели, что у loadDailyTargets', async () => {
    await seed();
    const range = await loadDailyTargetsRange('2026-11-01', '2026-11-14');
    expect(range.map((t) => t.date)).toEqual(Array.from({ length: 14 }, (_, i) => shiftDateKey('2026-11-01', i)));
    for (const t of range) expect(t).toEqual(await loadDailyTargets(t.date));
    // The seeded data really varies over the range, so the comparison above is not trivially equal.
    expect(new Set(range.map((t) => t.phase))).toEqual(new Set(['prep', 'taper', 'event', 'recovery', 'normal']));
    expect(range.some((t) => t.reasons.some((r) => r.startsWith('Внимание ниже нормы')))).toBe(true);
  });

  it('Given диапазон When загружаются цели Then число запросов к БД не зависит от числа дней', async () => {
    await seed();
    const tables = [
      db.lifeEvents,
      db.sleepLogs,
      db.checkIns,
      db.workoutLogs,
      db.weightLogs,
      db.cognitiveTests,
      db.meditationSessions,
    ];
    const spies = [...tables.map((t) => vi.spyOn(t, 'where')), vi.spyOn(db.settings, 'get')];
    const calls = () => spies.reduce((n, s) => n + s.mock.calls.length, 0);

    await loadDailyTargetsRange('2026-11-01', '2026-11-01');
    const oneDay = calls();
    spies.forEach((s) => s.mockClear());
    await loadDailyTargetsRange('2026-11-01', '2026-12-01');
    expect(calls()).toBe(oneDay);
  });

  it('returns nothing when `to` is before `from` and rejects ranges longer than 31 days', async () => {
    expect(await loadDailyTargetsRange('2026-11-02', '2026-11-01')).toEqual([]);
    expect(await loadDailyTargetsRange('2026-11-01', shiftDateKey('2026-11-01', MAX_RANGE_DAYS - 1))).toHaveLength(31);
    await expect(loadDailyTargetsRange('2026-11-01', shiftDateKey('2026-11-01', MAX_RANGE_DAYS))).rejects.toThrow(
      RangeError,
    );
  });

  it('previews an unsaved version of a stored event instead of the stored one', async () => {
    await db.lifeEvents.add(exam);
    const stored = await loadDailyTargetsRange('2026-11-04', '2026-11-04');
    const edited = await loadDailyTargetsRange('2026-11-04', '2026-11-04', { event: { ...exam, importance: 1 } });
    const added = await loadDailyTargetsRange('2026-11-04', '2026-11-04', {
      event: { ...exam, id: 'new', date: '2026-11-05', prepDays: 1 },
    });
    expect(stored[0].focusPomodoros).toBe(7);
    expect(edited[0].focusPomodoros).toBe(5);
    // A new event sits next to the stored ones: the nearer critical one drives the day (taper before it).
    expect(added[0].phase).toBe('taper');
    expect(await db.lifeEvents.count()).toBe(1);
  });
});

describe('useDailyTargetsRange', () => {
  it('Given даты from..to When компонент вызывает useDailyTargetsRange Then массив DailyTargets по дням из одного живого запроса', async () => {
    const { result } = renderHook(() => useDailyTargetsRange('2026-11-01', '2026-11-14'));
    await waitFor(() => expect(result.current).toHaveLength(14));
    expect(result.current!.every((t) => t.phase === 'normal')).toBe(true);

    // The live query follows the DB: a new event re-plans the whole range.
    await act(() => db.lifeEvents.add(exam));
    await waitFor(() => expect(result.current![8]).toMatchObject({ date: '2026-11-09', phase: 'event' }));
  });

  it('never shows targets computed from the rows of the previous range while a new range loads', async () => {
    await db.sleepLogs.add(night('2026-11-05', 5));
    const { result, rerender } = renderHook(({ from }: { from: string }) => useDailyTargetsRange(from, from), {
      initialProps: { from: '2026-11-04' },
    });
    await waitFor(() => expect(result.current?.[0].date).toBe('2026-11-04'));
    rerender({ from: '2026-11-05' });
    // Either still loading or the new day with its own short night — never 5 Nov computed without it.
    expect(result.current).toBeUndefined();
    await waitFor(() =>
      expect(result.current?.[0]).toMatchObject({ date: '2026-11-05', maxWorkoutIntensity: 'light' }),
    );
  });

  it('returns an empty list for an empty range', async () => {
    const { result } = renderHook(() => useDailyTargetsRange('2026-11-05', '2026-11-04'));
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it('recomputes a what-if event at once, from the rows already loaded', async () => {
    await db.lifeEvents.add(exam);
    const { result, rerender } = renderHook(
      ({ event }: { event?: LifeEvent }) => useDailyTargetsRange('2026-11-04', '2026-11-13', { event }),
      { initialProps: {} },
    );
    await waitFor(() => expect(result.current?.[0].focusPomodoros).toBe(7));
    const where = vi.spyOn(db.lifeEvents, 'where');
    rerender({ event: { ...exam, importance: 1 } });
    expect(result.current?.[0].focusPomodoros).toBe(5);
    expect(where).not.toHaveBeenCalled();
  });
});
