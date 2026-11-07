import { describe, expect, it } from 'vitest';
import { buildWorkout, draftFromExercises, exerciseIds, toggleSet, workoutTypeFor } from './session';

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

  it('passes the muscle groups of an exercise (a carried copy has them) on to the journal', () => {
    const draft = toggleSet(
      draftFromExercises([{ name: 'Свой комплекс', sets: 1, muscleGroups: ['back'], carriedFrom: '2026-11-02' }]),
      0,
      0,
    );
    const built = buildWorkout(draft, { date: '2026-11-04', durationMin: '30', rpe: '6' });
    expect(built.ok && built.value.exercises).toEqual([{ name: 'Свой комплекс', muscleGroups: ['back'], sets: [{}] }]);
  });

  it('exerciseIds: own exercises by position, carried ones by origin and name — removing a carried one keeps the rest', () => {
    const own = [
      { name: 'Жим', sets: 3 },
      { name: 'Присед', sets: 3 },
    ];
    const a = { name: 'Тяга', sets: 2, carriedFrom: '2026-11-02' };
    const b = { name: 'Подтягивания', sets: 2, carriedFrom: '2026-11-02' };
    expect(exerciseIds([...own, a, b])).toEqual([
      'own:0',
      'own:1',
      'carried:2026-11-02:тяга',
      'carried:2026-11-02:подтягивания',
    ]);
    expect(exerciseIds([...own, b])).toEqual(['own:0', 'own:1', 'carried:2026-11-02:подтягивания']);
    // The same exercise carried twice from one day stays distinct.
    expect(exerciseIds([a, a])).toEqual(['carried:2026-11-02:тяга', 'carried:2026-11-02:тяга#2']);
  });
});
