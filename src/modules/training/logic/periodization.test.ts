import { describe, expect, it } from 'vitest';
import { DELOAD_FACTOR } from '../../../core/adaptation/rules';
import { adjustForTargets, dayMark, deloadExercises } from './periodization';

const ex = [
  { name: 'Присед', sets: 5, reps: 5, weightKg: 100, rpeTarget: 8 },
  { name: 'Планка', sets: 1 },
  { name: 'Жим', sets: 3, reps: 8, weightKg: 62.5, rpeTarget: 6 },
];

describe('deloadExercises', () => {
  it('Given deload = true Then веса и объём −40%', () => {
    expect(DELOAD_FACTOR).toBe(0.6);
    expect(deloadExercises(ex)).toEqual([
      { name: 'Присед', sets: 3, reps: 5, weightKg: 60, rpeTarget: 8 },
      { name: 'Планка', sets: 1 },
      { name: 'Жим', sets: 2, reps: 8, weightKg: 37.5, rpeTarget: 6 },
    ]);
  });

  it('never goes below one set and rounds weight to 0.5 kg', () => {
    expect(deloadExercises([{ name: 'A', sets: 1, weightKg: 21 }])).toEqual([{ name: 'A', sets: 1, weightKg: 12.5 }]);
  });
});

describe('adjustForTargets', () => {
  const reasons = ['Завтра «Экзамен»: разгрузочный день, нагрузка −40%'];

  it('deload scales the session and passes the reasons on', () => {
    const r = adjustForTargets(ex, { deload: true, maxWorkoutIntensity: 'light', reasons });
    expect(r.deload).toBe(true);
    expect(r.exercises[0].sets).toBe(3);
    expect(r.reasons).toEqual(reasons);
  });

  it('Given maxWorkoutIntensity = rest Then the session is suggested to move', () => {
    const r = adjustForTargets(ex, { deload: false, maxWorkoutIntensity: 'rest', reasons });
    expect(r.rest).toBe(true);
    expect(r.exercises).toEqual(ex);
  });

  it('Given maxWorkoutIntensity = light Then exercises with RPE ≥ 7 are flagged «сегодня легче»', () => {
    const r = adjustForTargets(ex, { deload: false, maxWorkoutIntensity: 'light', reasons: [] });
    expect(r.easier).toEqual([true, false, false]);
  });

  it('a normal day changes nothing', () => {
    const r = adjustForTargets(ex, { deload: false, maxWorkoutIntensity: 'hard', reasons: [] });
    expect(r).toEqual({ exercises: ex, deload: false, rest: false, easier: [false, false, false], reasons: [] });
  });
});

describe('adjustForTargets on the event day (deload + rest)', () => {
  it('still deloads and flags hard exercises when performed anyway', () => {
    const r = adjustForTargets(ex, { deload: true, maxWorkoutIntensity: 'rest', reasons: [] });
    expect(r.rest).toBe(true);
    expect(r.deload).toBe(true);
    expect(r.exercises[0].sets).toBe(3);
    expect(r.easier).toEqual([true, false, false]);
  });
});

describe('dayMark', () => {
  it('rest wins over deload; otherwise deload; otherwise nothing', () => {
    expect(dayMark({ deload: true, maxWorkoutIntensity: 'rest' })).toBe('rest');
    expect(dayMark({ deload: true, maxWorkoutIntensity: 'light' })).toBe('deload');
    expect(dayMark({ deload: false, maxWorkoutIntensity: 'hard' })).toBeUndefined();
  });
});
