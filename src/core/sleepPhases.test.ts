import { describe, expect, it } from 'vitest';
import { AWAKE_MOVEMENT, isLightSleepAt, LIGHT_MIN_MOVEMENT, RISE_FACTOR, sleepStages } from './sleepPhases';
import type { NightSample } from './types';

const T0 = new Date(2026, 10, 7, 23, 0).getTime();
const MIN = 60_000;
/** A synthetic night: one sample per minute from T0 with the given movement values (null = no reading). */
const night = (movements: (number | null)[]): NightSample[] =>
  movements.map((m, i) => ({
    minuteStart: T0 + i * MIN,
    movement: m,
    movementPeak: m,
    noiseDb: -60,
    noisePeakDb: -50,
  }));
const repeat = (value: number | null, n: number) => Array<number | null>(n).fill(value);

/**
 * Synthetic nights shared with the Java twin (`android/…/SmartWakeTest.java` uses the same vectors): if one side
 * changes the rule, both tests must change.
 */
export const DEEP_THEN_STIR = [...repeat(0.01, 20), 0.08, 0.09, 0.1, 0.12, 0.1]; // light at minute 24
export const STILL = repeat(0.01, 25); // never light
export const RESTLESS = repeat(0.2, 25); // moving all along: no rise → not «coming out of stillness»

describe('sleep phases (#250)', () => {
  it('Given правило лёгкого сна When проверяется Then выход из неподвижного отрезка: среднее за 5 минут выросло относительно предыдущих 15 и не ниже порога', () => {
    const stir = night(DEEP_THEN_STIR);
    expect(isLightSleepAt(stir, T0 + 24 * MIN)).toBe(true);
    expect(isLightSleepAt(stir, T0 + 19 * MIN)).toBe(false); // still deep
    expect(isLightSleepAt(night(STILL), T0 + 24 * MIN)).toBe(false);
    expect(isLightSleepAt(night(RESTLESS), T0 + 24 * MIN)).toBe(false);
    // Constants with their meaning.
    expect(LIGHT_MIN_MOVEMENT).toBe(0.05);
    expect(RISE_FACTOR).toBe(1.5);
  });

  it('needs readings: too few minutes or gaps are not light sleep', () => {
    expect(isLightSleepAt(night([0.1, 0.1, 0.1]), T0 + 2 * MIN)).toBe(false);
    expect(isLightSleepAt(night([...repeat(0.01, 20), ...repeat(null, 5)]), T0 + 24 * MIN)).toBe(false);
  });

  it('stages: deep while still, light while stirring, awake while moving a lot; merged and clipped to the night', () => {
    const samples = night([
      ...repeat(0.01, 10),
      ...repeat(0.08, 5),
      AWAKE_MOVEMENT + 0.1,
      AWAKE_MOVEMENT + 0.2,
      ...repeat(0.01, 8),
    ]);
    const stages = sleepStages(samples, T0, T0 + 25 * MIN);
    // After waking the 5-minute mean stays high a while (settling: light), then deep again.
    expect(stages.map((s) => s.stage)).toEqual(['deep', 'light', 'awake', 'light', 'deep']);
    expect(stages[0]).toEqual({ start: T0, end: T0 + 12 * MIN, stage: 'deep' }); // the 5-minute mean crosses 0.05 at minute 12
    expect(stages.at(-1)!.end).toBe(T0 + 25 * MIN);
    // Minutes outside the night are left out; no readings — no stages.
    expect(sleepStages(samples, T0 + 5 * MIN, T0 + 8 * MIN)).toEqual([
      { start: T0 + 5 * MIN, end: T0 + 8 * MIN, stage: 'deep' },
    ]);
    expect(sleepStages(night(repeat(null, 5)), T0, T0 + 5 * MIN)).toEqual([]);
  });
});
