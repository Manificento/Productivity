import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS, muscleGroupsOf, normalizeExerciseName, STARTER_EXERCISES } from './exercises';
import type { MuscleGroup, PlannedSession, ProgramExercise, WorkoutLog } from './types';

/** Every exercise of the training templates (`PROGRAM_TEMPLATES` in src/modules/training/logic/programs.ts). */
const TEMPLATE_EXERCISES: [string, MuscleGroup[]][] = [
  ['Приседания', ['legs', 'glutes', 'core']],
  ['Жим лёжа', ['chest', 'shoulders', 'arms']],
  ['Тяга в наклоне', ['back', 'arms']],
  ['Румынская тяга', ['legs', 'glutes', 'back']],
  ['Жим стоя', ['shoulders', 'arms', 'core']],
  ['Подтягивания', ['back', 'arms']],
  ['Отжимания на брусьях', ['chest', 'arms', 'shoulders']],
  ['Планка', ['core']],
  ['Лёгкий бег 30 минут', ['cardio', 'legs']],
  ['Интервалы по 2 минуты', ['cardio', 'legs']],
  ['Длинный бег 45 минут', ['cardio', 'legs']],
  ['Растяжка всего тела', ['mobility']],
];

describe('src/core/types.ts — muscleGroups у упражнений', () => {
  it('Given src/core/types.ts When читаю тип упражнения программы и PlannedSession.exercises Then есть необязательное поле muscleGroups: MuscleGroup[]; существующие записи читаются без миграции данных', () => {
    const legacy: ProgramExercise = { name: 'Приседания', sets: 3, reps: 8 };
    const tagged: ProgramExercise = { ...legacy, muscleGroups: ['legs', 'glutes'] };
    const session: Pick<PlannedSession, 'exercises'> = { exercises: [legacy, tagged] };
    const log: Pick<WorkoutLog, 'exercises'> = { exercises: [{ name: 'Планка', sets: [], muscleGroups: ['core'] }] };
    expect(session.exercises.map((e) => e.muscleGroups)).toEqual([undefined, ['legs', 'glutes']]);
    expect(log.exercises?.[0]?.muscleGroups).toEqual(['core']);
    expect(MUSCLE_GROUPS).toEqual([
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'glutes',
      'core',
      'cardio',
      'mobility',
    ]);
  });
});

describe('src/core/exercises.ts — словарь стартовых упражнений и muscleGroupsOf()', () => {
  it.each(TEMPLATE_EXERCISES)(
    'Given src/core/exercises.ts When читаю Then у упражнения шаблона «%s» есть группы мышц',
    (name, groups) => {
      expect(muscleGroupsOf(name)).toEqual(groups);
    },
  );

  it('every starter exercise has at least one known muscle group and a unique normalized name', () => {
    const seen = new Set<string>();
    for (const entry of STARTER_EXERCISES) {
      expect(entry.muscleGroups.length).toBeGreaterThan(0);
      for (const g of entry.muscleGroups) expect(MUSCLE_GROUPS).toContain(g);
      for (const name of [entry.name, ...entry.aliases]) {
        const key = normalizeExerciseName(name);
        expect(seen.has(key), `duplicate name ${name}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('normalizes case, ё, punctuation and extra spaces of Russian names', () => {
    expect(muscleGroupsOf('  жим   ЛЁЖА ')).toEqual(['chest', 'shoulders', 'arms']);
    expect(muscleGroupsOf('Жим лежа')).toEqual(['chest', 'shoulders', 'arms']);
    expect(muscleGroupsOf('Отжимания на брусьях!')).toEqual(['chest', 'arms', 'shoulders']);
  });

  it('recognizes English names of the same exercises', () => {
    expect(muscleGroupsOf('Squat')).toEqual(['legs', 'glutes', 'core']);
    expect(muscleGroupsOf('bench press')).toEqual(['chest', 'shoulders', 'arms']);
    expect(muscleGroupsOf('Bent-over row')).toEqual(['back', 'arms']);
    expect(muscleGroupsOf('Romanian deadlift')).toEqual(['legs', 'glutes', 'back']);
    expect(muscleGroupsOf('Overhead press')).toEqual(['shoulders', 'arms', 'core']);
    expect(muscleGroupsOf('Pull-ups')).toEqual(['back', 'arms']);
    expect(muscleGroupsOf('DIPS')).toEqual(['chest', 'arms', 'shoulders']);
    expect(muscleGroupsOf('plank')).toEqual(['core']);
    expect(muscleGroupsOf('Stretching')).toEqual(['mobility']);
  });

  it('ignores a duration at the end of the name (Длинный бег 60 минут, Easy run 20 min)', () => {
    expect(muscleGroupsOf('Длинный бег 60 минут')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Лёгкий бег 20 мин')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Easy run 20 min')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Бег')).toEqual(['cardio', 'legs']);
  });

  it('returns an empty list for an unknown or empty name', () => {
    expect(muscleGroupsOf('Жонглирование')).toEqual([]);
    expect(muscleGroupsOf('   ')).toEqual([]);
  });

  it('returns a copy: changing the result does not change the dictionary', () => {
    const groups = muscleGroupsOf('Планка');
    groups.push('legs');
    expect(muscleGroupsOf('Планка')).toEqual(['core']);
  });
});
