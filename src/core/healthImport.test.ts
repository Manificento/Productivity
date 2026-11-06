import { describe, expect, it } from 'vitest';
import {
  toImportedWorkouts,
  toSleepNights,
  workoutTypeName,
  type StoreSleepSample,
  type StoreWorkout,
} from './healthImport';

const iso = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const ms = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('toSleepNights', () => {
  it('takes an Android sleep session with stages as one night and counts minutes asleep', () => {
    const session: StoreSleepSample = {
      startDate: iso(5, 23, 30),
      endDate: iso(6, 7, 0),
      platformId: 'hc-1',
      sourceId: 'com.google.android.apps.fitness',
      sourceName: 'Fit',
      stages: [
        { startDate: iso(5, 23, 30), endDate: iso(6, 0, 0), stage: 'awake' },
        { startDate: iso(6, 0, 0), endDate: iso(6, 3, 0), stage: 'deep' },
        { startDate: iso(6, 3, 0), endDate: iso(6, 6, 30), stage: 'light' },
        { startDate: iso(6, 6, 30), endDate: iso(6, 7, 0), stage: 'rem' },
      ],
    };
    expect(toSleepNights([session])).toEqual([
      {
        externalId: 'hc-1',
        sourceId: 'com.google.android.apps.fitness',
        sourceName: 'Fit',
        bedtime: ms(5, 23, 30),
        wakeTime: ms(6, 7),
        asleepMin: 420,
      },
    ]);
  });

  it('merges HealthKit segments of one app into nights (gaps under an hour), keeping apps apart', () => {
    const seg = (
      id: string,
      d1: number,
      h1: number,
      m1: number,
      d2: number,
      h2: number,
      m2: number,
      state: string,
      src = 'com.apple.health',
    ) => ({
      startDate: iso(d1, h1, m1),
      endDate: iso(d2, h2, m2),
      platformId: id,
      sourceId: src,
      sleepState: state as StoreSleepSample['sleepState'],
    });
    const nights = toSleepNights([
      seg('a', 5, 23, 0, 6, 0, 0, 'inBed'),
      seg('b', 6, 0, 0, 6, 3, 0, 'deep'),
      seg('c', 6, 3, 20, 6, 6, 50, 'light'),
      seg('d', 6, 14, 0, 6, 14, 40, 'asleep'), // a nap: more than an hour later → its own «night»
      seg('w', 5, 23, 30, 6, 7, 0, 'asleep', 'com.watch.app'), // the same night from another app
    ]);
    expect(nights).toEqual([
      { externalId: 'a', sourceId: 'com.apple.health', bedtime: ms(5, 23), wakeTime: ms(6, 6, 50), asleepMin: 390 },
      { externalId: 'w', sourceId: 'com.watch.app', bedtime: ms(5, 23, 30), wakeTime: ms(6, 7), asleepMin: 450 },
      { externalId: 'd', sourceId: 'com.apple.health', bedtime: ms(6, 14), wakeTime: ms(6, 14, 40), asleepMin: 40 },
    ]);
  });

  it('without stages or states leaves asleepMin out, and gives a stable id when the store has none', () => {
    const [night] = toSleepNights([{ startDate: iso(5, 23), endDate: iso(6, 7) }]);
    expect(night).toEqual({
      externalId: `unknown:${ms(5, 23)}:${ms(6, 7)}`,
      sourceId: 'unknown',
      bedtime: ms(5, 23),
      wakeTime: ms(6, 7),
    });
  });

  it('drops samples with unreadable or reversed times', () => {
    expect(
      toSleepNights([
        { startDate: 'x', endDate: iso(6, 7) },
        { startDate: iso(6, 7), endDate: iso(5, 23) },
      ]),
    ).toEqual([]);
  });
});

describe('toImportedWorkouts', () => {
  it('maps a store workout to the app types with local day, whole minutes, energy and distance', () => {
    const run: StoreWorkout = {
      workoutType: 'running',
      duration: 1830,
      totalEnergyBurned: 310.4,
      totalDistance: 5012,
      startDate: iso(6, 7, 15),
      endDate: iso(6, 7, 45),
      sourceId: 'com.strava',
      sourceName: 'Strava',
      platformId: 'hk-run',
    };
    expect(toImportedWorkouts([run])).toEqual([
      {
        externalId: 'hk-run',
        sourceId: 'com.strava',
        sourceName: 'Strava',
        date: '2026-11-06',
        startedAt: ms(6, 7, 15),
        type: 'Бег',
        durationMin: 31,
        kcal: 310,
        distanceM: 5012,
      },
    ]);
  });

  it('keeps at least one minute and at most a day, and drops workouts with unreadable times', () => {
    const base = { workoutType: 'yoga' as const, startDate: iso(6, 8), endDate: iso(6, 8, 1) };
    expect(toImportedWorkouts([{ ...base, duration: 5 }])[0]).toMatchObject({ durationMin: 1, type: 'Йога' });
    expect(toImportedWorkouts([{ ...base, duration: 100_000 }])[0]?.durationMin).toBe(1440);
    expect(toImportedWorkouts([{ ...base, duration: 600, startDate: 'nope' }])).toEqual([]);
  });

  it.each([
    ['traditionalStrengthTraining', 'Силовая'],
    ['weightlifting', 'Силовая'],
    ['runningTreadmill', 'Бег'],
    ['bikingStationary', 'Велосипед'],
    ['swimmingPool', 'Плавание'],
    ['hiking', 'Ходьба'],
    ['yoga', 'Йога'],
    ['tennis', 'Другое'],
  ])('workout type %s → %s', (from, to) => {
    expect(workoutTypeName(from)).toBe(to);
  });
});
