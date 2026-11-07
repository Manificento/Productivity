import { describe, expect, it } from 'vitest';
import type { ImportedSleep, ImportedWorkout } from '../../../core/types';
import { IMPORT_DAYS, IMPORTED_RPE, importRange, sleepInputs, workoutInputs } from './healthImport';
import { DEFAULT_QUALITY } from './sleep';

const ms = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const night = (id: string, d: number, main = true): ImportedSleep => ({
  externalId: id,
  sourceId: 'com.fitbit',
  bedtime: ms(d - 1, 23),
  wakeTime: ms(d, 7),
  main,
});
const workout = (id: string, durationMin: number): ImportedWorkout => ({
  externalId: id,
  sourceId: 'com.strava',
  date: '2026-11-05',
  startedAt: ms(5, 7),
  type: 'Бег',
  durationMin,
});

describe('health import logic (#131)', () => {
  it('reads the last 30 days, today included', () => {
    expect(importRange('2026-11-07')).toEqual({ from: '2026-10-09', to: '2026-11-07' });
    expect(IMPORT_DAYS).toBe(30);
  });

  it('only main nights become sleep records (naps are extra entries), with the import keys and the default quality', () => {
    expect(sleepInputs([night('n-5', 5), night('nap-5', 5, false)])).toEqual([
      {
        bedtime: ms(4, 23),
        wakeTime: ms(5, 7),
        quality: DEFAULT_QUALITY,
        sourceId: 'com.fitbit',
        externalId: 'n-5',
      },
    ]);
  });

  it('workouts get the default RPE and whole minutes (1–1440); shorter than a minute is skipped', () => {
    expect(workoutInputs([workout('w-1', 30.4), workout('w-2', 0.2), workout('w-3', 2_000)])).toEqual([
      {
        date: '2026-11-05',
        type: 'Бег',
        durationMin: 30,
        rpe: IMPORTED_RPE,
        sourceId: 'com.strava',
        externalId: 'w-1',
      },
      {
        date: '2026-11-05',
        type: 'Бег',
        durationMin: 1440,
        rpe: IMPORTED_RPE,
        sourceId: 'com.strava',
        externalId: 'w-3',
      },
    ]);
  });
});
