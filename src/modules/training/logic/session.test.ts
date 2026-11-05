import { describe, expect, it } from 'vitest';
import { buildWorkout, draftFromExercises, toggleSet, workoutTypeFor } from './session';

const exercises = [
  { name: 'Присед', sets: 3, reps: 5, weightKg: 80 },
  { name: 'Планка', sets: 2 },
  { name: 'Жим', sets: 3, reps: 8 },
];

describe('session draft', () => {
  it('starts with no sets done', () => {
    const d = draftFromExercises(exercises);
    expect(d.map((e) => e.done)).toEqual([
      [false, false, false],
      [false, false],
      [false, false, false],
    ]);
  });

  it('toggleSet flips one set only', () => {
    const d = toggleSet(draftFromExercises(exercises), 0, 1);
    expect(d[0].done).toEqual([false, true, false]);
    expect(d[1].done).toEqual([false, false]);
  });
});

describe('buildWorkout', () => {
  const base = { date: '2026-11-04', durationMin: '50', rpe: '7' };

  it('keeps only done sets, with planned reps and weight; drops untouched exercises', () => {
    let d = draftFromExercises(exercises);
    d = toggleSet(toggleSet(d, 0, 0), 0, 1);
    d = toggleSet(d, 1, 0);
    expect(buildWorkout(d, base)).toEqual({
      ok: true,
      value: {
        date: '2026-11-04',
        type: 'Силовая',
        durationMin: 50,
        rpe: 7,
        exercises: [
          {
            name: 'Присед',
            sets: [
              { reps: 5, weightKg: 80 },
              { reps: 5, weightKg: 80 },
            ],
          },
          { name: 'Планка', sets: [{}] },
        ],
      },
    });
  });

  it('requires at least one done set, a duration and an RPE', () => {
    const d = toggleSet(draftFromExercises(exercises), 0, 0);
    expect(buildWorkout(draftFromExercises(exercises), base)).toEqual({
      ok: false,
      error: 'Отметьте хотя бы один подход',
    });
    expect(buildWorkout(d, { ...base, durationMin: '' })).toEqual({
      ok: false,
      error: 'Укажите длительность в минутах',
    });
    expect(buildWorkout(d, { ...base, rpe: '11' })).toEqual({ ok: false, error: 'RPE — от 1 до 10' });
  });
});

describe('workoutTypeFor', () => {
  it('maps a program name to a workout type', () => {
    expect(workoutTypeFor('Бег')).toBe('Бег');
    expect(workoutTypeFor('Сила 3 раза в неделю')).toBe('Силовая');
    expect(workoutTypeFor('Растяжка')).toBe('Другое');
  });
});
