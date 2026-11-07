import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { HEALTH_TEXTS } from '../../../core/platform';
import { mockHealthStore, mockNativePlatform } from '../../../test/platform';
import {
  connectHealthImport,
  disconnectHealthImport,
  importIfDue,
  loadHealthImport,
  removeSleep,
  runHealthImport,
} from './healthImport';
import { saveSleep } from '../../../core/logging/sleep';
import { saveWorkout } from '../../../core/logging/workout';

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
    // 1 Nov is inside the 30 days (from 9 Oct); 8 Oct is outside.
    store.sleep = [
      night('n-5', 5),
      night('n-6', 6),
      night('old', 1),
      {
        ...night('too-old', 8),
        startDate: new Date(2026, 9, 7, 23).toISOString(),
        endDate: new Date(2026, 9, 8, 7).toISOString(),
      },
    ];
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

    expect(await db.sleepLogs.where('date').equals('2026-10-08').count()).toBe(0);

    // Again: nothing doubles.
    await runHealthImport(TODAY, NOW + 1);
    expect(await db.sleepLogs.count()).toBe(3);
    expect(await db.workoutLogs.count()).toBe(1);
  });

  it('an imported night the user deleted is not imported again', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.sleep = [night('n-6', 6)];
    await connectHealthImport(TODAY, NOW);
    const [log] = await db.sleepLogs.toArray();
    await removeSleep(log!);
    expect(await runHealthImport(TODAY, NOW + 1)).toMatchObject({ nights: 0 });
    expect(await db.sleepLogs.count()).toBe(0);
  });

  it('counts only nights the import holds: a day already logged by hand is kept and not counted', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    await saveSleep({
      bedtime: new Date(2026, 10, 5, 23, 30).getTime(),
      wakeTime: new Date(2026, 10, 6, 7, 0).getTime(),
      quality: 4,
    });
    store.sleep = [night('n-6', 6), night('n-7', 7)];
    expect(await connectHealthImport(TODAY, NOW)).toMatchObject({ nights: 1 });
  });

  it('access withdrawn later: the background run stores why; the next good run clears it', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    await connectHealthImport(TODAY, NOW);
    store.granted = [];
    await importIfDue(TODAY, NOW + 2 * 3_600_000);
    expect(await loadHealthImport()).toEqual({
      enabled: true,
      lastRunAt: NOW + 2 * 3_600_000,
      lastError: HEALTH_TEXTS.deniedAndroid,
    });
    store.granted = ['sleep', 'workouts'];
    await runHealthImport(TODAY, NOW + 3 * 3_600_000);
    expect(await loadHealthImport()).toEqual({ enabled: true, lastRunAt: NOW + 3 * 3_600_000 });
  });

  it("while today's night is missing the hourly limit does not apply; two runs at once share one", async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    await connectHealthImport(TODAY, NOW);
    store.sleep = [night('n-7', 7)]; // the watch synced later
    await importIfDue(TODAY, NOW + 5 * 60_000);
    expect(await db.sleepLogs.where('date').equals(TODAY).count()).toBe(1);

    const reads = store.bridge.readSamples.mock.calls.length;
    await Promise.all([runHealthImport(TODAY, NOW + 10), runHealthImport(TODAY, NOW + 11)]);
    expect(store.bridge.readSamples.mock.calls.length - reads).toBe(reads / 2);
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
    store.sleep = [night('n-7', 7)];
    await importIfDue(TODAY, NOW);
    expect(store.bridge.readSamples).not.toHaveBeenCalled(); // off

    await connectHealthImport(TODAY, NOW); // today's night is in
    const reads = store.bridge.readSamples.mock.calls.length;
    await importIfDue(TODAY, NOW + 30 * 60_000);
    expect(store.bridge.readSamples.mock.calls.length).toBe(reads); // ran half an hour ago
    store.sleep = [night('n-7', 7), night('n-6', 6)];
    await importIfDue(TODAY, NOW + 2 * 3_600_000);
    expect(await db.sleepLogs.where('date').equals('2026-11-06').count()).toBe(1);

    await disconnectHealthImport();
    expect((await loadHealthImport()).enabled).toBe(false);
  });

  it('a night the store reports as impossible (over 16 h) is skipped, the rest is saved', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.sleep = [{ ...night('long', 5), startDate: iso(3, 20) }, night('n-6', 6)];
    expect(await connectHealthImport(TODAY, NOW)).toMatchObject({ status: 'ok', nights: 1 });
  });

  it('Given импортированная тренировка (sourceId + externalId) удалена из журнала When импорт снова читает тот же период Then она не записывается заново', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.workouts = [run('w-5', 5), run('w-6', 6)];
    await connectHealthImport(TODAY, NOW);
    expect(await db.workoutLogs.count()).toBe(2);

    // Deleted in «Тренировки» (training deletes the journal row directly).
    const gone = await db.workoutLogs.where('[sourceId+externalId]').equals(['com.strava', 'w-5']).first();
    await db.workoutLogs.delete(gone!.id);
    expect(await runHealthImport(TODAY, NOW + 1)).toMatchObject({ workouts: 1 });
    expect((await db.workoutLogs.toArray()).map((w) => w.externalId)).toEqual(['w-6']);

    // A new workout in the store still comes in.
    store.workouts = [run('w-5', 5), run('w-6', 6), run('w-7', 7)];
    await runHealthImport(TODAY, NOW + 2);
    expect((await db.workoutLogs.toArray()).map((w) => w.externalId).sort()).toEqual(['w-6', 'w-7']);
  });

  it('Given тренировка введена вручную и удалена When она удалена Then поведение как сейчас', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    await connectHealthImport(TODAY, NOW);
    const manual = await saveWorkout({ date: TODAY, type: 'Бег', durationMin: 20, rpe: 6 });
    await db.workoutLogs.delete(manual.id);
    store.workouts = [run('w-7', 7)];
    await runHealthImport(TODAY, NOW + 1);
    expect((await db.workoutLogs.toArray()).map((w) => w.externalId)).toEqual(['w-7']);
    // The manual delete leaves no trace in the import's memory.
    expect((await db.settings.get('health.import.workouts'))?.value).toEqual([
      { key: 'com.strava|w-7', date: '2026-11-07' },
    ]);
  });

  it('remembers only workouts within the import window', async () => {
    mockNativePlatform('android', ['healthImport']);
    const store = mockHealthStore();
    store.workouts = [run('w-5', 5)];
    await connectHealthImport(TODAY, NOW);
    // A month later w-5 is out of the window: it is forgotten (the store is not read that far back either).
    store.workouts = [];
    await runHealthImport('2026-12-20', NOW + 1);
    expect((await db.settings.get('health.import.workouts'))?.value).toEqual([]);
  });
});
