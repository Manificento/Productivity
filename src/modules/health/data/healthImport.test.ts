import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { HEALTH_TEXTS } from '../../../core/platform';
import { mockHealthStore, mockNativePlatform } from '../../../test/platform';
import {
  connectHealthImport,
  disconnectHealthImport,
  importIfDue,
  loadHealthImport,
  runHealthImport,
} from './healthImport';

const TODAY = '2026-11-07';
const NOW = new Date(2026, 10, 7, 8, 0).getTime();
const iso = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const night = (id: string, d: number) => ({
  dataType: 'sleep' as const,
  value: 0,
  unit: 'minute' as const,
  startDate: iso(d - 1, 23),
  endDate: iso(d, 7),
  platformId: id,
  sourceId: 'com.fitbit',
  sleepState: 'asleep' as const,
});
const run = (id: string, d: number) => ({
  workoutType: 'running' as const,
  duration: 1800,
  startDate: iso(d, 7),
  endDate: iso(d, 7, 30),
  platformId: id,
  sourceId: 'com.strava',
});

beforeEach(async () => {
  await Promise.all([db.settings.clear(), db.sleepLogs.clear(), db.workoutLogs.clear()]);
});
afterEach(() => vi.restoreAllMocks());

describe('health import data (#131)', () => {
  it('Given натив When я включаю импорт и даю разрешение Then сон за 30 дней записан через saveSleep(), тренировки — через saveWorkout(), без дублей при повторном импорте', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore([], { sleep: 'allow', workouts: 'allow' });
    store.sleep = [night('n-5', 5), night('n-6', 6), night('old', 1)]; // 1 Nov is inside 30 days too
    store.workouts = [run('w-6', 6)];

    expect(await connectHealthImport(TODAY, NOW)).toEqual({ status: 'ok', nights: 3, workouts: 1 });
    expect(await loadHealthImport()).toEqual({ enabled: true, lastRunAt: NOW });
    expect(await db.sleepLogs.count()).toBe(3);
    expect(await db.sleepLogs.where('date').equals('2026-11-06').first()).toMatchObject({
      sourceId: 'com.fitbit',
      externalId: 'n-6',
    });
    expect(await db.workoutLogs.toArray()).toMatchObject([
      { date: '2026-11-06', type: 'Бег', durationMin: 30, rpe: 5, sourceId: 'com.strava', externalId: 'w-6' },
    ]);

    // Again: nothing doubles.
    await runHealthImport(TODAY, NOW + 1);
    expect(await db.sleepLogs.count()).toBe(3);
    expect(await db.workoutLogs.count()).toBe(1);
  });

  it('Given отказ в разрешении When я пробую импорт Then понятная ошибка и ручной ввод: import stays off, nothing is written', async () => {
    mockNativePlatform('android', ['healthImport']);
    mockHealthStore([], { sleep: 'deny', workouts: 'deny' });
    expect(await connectHealthImport(TODAY, NOW)).toEqual({ status: 'denied', hint: HEALTH_TEXTS.deniedAndroid });
    expect(await loadHealthImport()).toEqual({ enabled: false });
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('only sleep allowed: sleep is imported and the workouts say why not', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore([], { sleep: 'allow', workouts: 'deny' });
    store.sleep = [night('n-6', 6)];
    store.workouts = [run('w-6', 6)];
    expect(await connectHealthImport(TODAY, NOW)).toEqual({
      status: 'ok',
      nights: 1,
      workouts: 0,
      hint: HEALTH_TEXTS.deniedAndroid,
    });
  });

  it('on the web it is unsupported', async () => {
    expect(await connectHealthImport(TODAY, NOW)).toEqual({ status: 'unsupported', hint: HEALTH_TEXTS.web });
  });

  it('importIfDue runs when on and the last run is over an hour ago; disconnect turns it off', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    await importIfDue(TODAY, NOW);
    expect(store.bridge.readSamples).not.toHaveBeenCalled(); // off

    await connectHealthImport(TODAY, NOW);
    const reads = store.bridge.readSamples.mock.calls.length;
    await importIfDue(TODAY, NOW + 30 * 60_000);
    expect(store.bridge.readSamples.mock.calls.length).toBe(reads); // ran half an hour ago
    store.sleep = [night('n-7', 7)];
    await importIfDue(TODAY, NOW + 2 * 3_600_000);
    expect(await db.sleepLogs.where('date').equals(TODAY).count()).toBe(1);

    await disconnectHealthImport();
    expect((await loadHealthImport()).enabled).toBe(false);
  });

  it('a night the store reports as impossible (over 16 h) is skipped, the rest is saved', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.sleep = [{ ...night('long', 5), startDate: iso(3, 20) }, night('n-6', 6)];
    expect(await connectHealthImport(TODAY, NOW)).toMatchObject({ status: 'ok', nights: 1 });
  });
});
