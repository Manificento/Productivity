import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
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
  beforeEach(async () => {
    await Promise.all([db.plannedSessions.clear(), db.workoutLogs.clear()]);
  });

  it('Given src/core/types.ts When читаю тип упражнения программы и PlannedSession.exercises Then есть необязательное поле muscleGroups: MuscleGroup[]; существующие записи читаются без миграции данных', async () => {
    const version = db.verno;
    // Rows as written before #225: exercises without muscleGroups.
    const legacySession: PlannedSession = {
      id: 'ps-legacy',
      createdAt: 1,
      updatedAt: 1,
      programId: 'p1',
      date: '2026-11-02',
      exercises: [{ name: 'Приседания', sets: 3, reps: 8 }],
      status: 'planned',
    };
    const legacyLog: WorkoutLog = {
      id: 'wl-legacy',
      createdAt: 1,
      updatedAt: 1,
      date: '2026-11-02',
      type: 'Силовая',
      durationMin: 40,
      rpe: 7,
      exercises: [{ name: 'Планка', sets: [{}] }],
    };
    await db.plannedSessions.add(legacySession);
    await db.workoutLogs.add(legacyLog);
    const tagged: ProgramExercise = { name: 'Жим лёжа', sets: 3, muscleGroups: ['chest', 'arms'] };
    await db.plannedSessions.update('ps-legacy', { exercises: [...legacySession.exercises, tagged] });

    const session = await db.plannedSessions.get('ps-legacy');
    const log = await db.workoutLogs.get('wl-legacy');
    expect(session?.exercises.map((e) => e.muscleGroups)).toEqual([undefined, ['chest', 'arms']]);
    expect(log).toEqual(legacyLog);
    expect(log?.exercises?.[0]?.muscleGroups).toBeUndefined();
    expect(db.verno).toBe(version);
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

  it('ignores a duration or distance at the end of the name (Длинный бег 60 минут, Easy run 5 km, Планка 60 сек)', () => {
    expect(muscleGroupsOf('Длинный бег 60 минут')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Лёгкий бег 20 мин')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Easy run 20 min')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Бег')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Лёгкий бег 5 км')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Easy run 5 km')).toEqual(['cardio', 'legs']);
    expect(muscleGroupsOf('Планка 60 сек')).toEqual(['core']);
    expect(muscleGroupsOf('Планка 1 минуту')).toEqual(['core']);
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

describe('src/core/types.ts — пометки переноса (#238)', () => {
  beforeEach(async () => {
    await db.plannedSessions.clear();
  });

  it('Given src/core/types.ts When читаю ProgramExercise Then есть необязательное carriedFrom?: DateKey — день пропущенной сессии; существующие записи читаются без миграции', async () => {
    const version = db.verno;
    const legacy: PlannedSession = {
      id: 'ps-old',
      createdAt: 1,
      updatedAt: 1,
      programId: 'p1',
      date: '2026-11-09',
      exercises: [{ name: 'Приседания', sets: 3 }],
      status: 'planned',
    };
    await db.plannedSessions.add(legacy);
    const carried: ProgramExercise = { name: 'Тяга в наклоне', sets: 2, carriedFrom: '2026-11-07' };
    await db.plannedSessions.update('ps-old', { exercises: [...legacy.exercises, carried] });
    const stored = await db.plannedSessions.get('ps-old');
    expect(stored?.exercises.map((e) => e.carriedFrom)).toEqual([undefined, '2026-11-07']);
    expect(db.verno).toBe(version);
  });

  it('Given PlannedSession When читаю Then есть необязательное carriedOut?: string[] — названия упражнений этой пропущенной сессии, уже перенесённых (или отклонённых): автоматический перенос их больше не трогает', async () => {
    const skipped: PlannedSession = {
      id: 'ps-skipped',
      createdAt: 1,
      updatedAt: 1,
      programId: 'p1',
      date: '2026-11-07',
      exercises: [{ name: 'Тяга в наклоне', sets: 3 }],
      status: 'skipped',
    };
    await db.plannedSessions.add(skipped);
    expect((await db.plannedSessions.get('ps-skipped'))?.carriedOut).toBeUndefined();
    await db.plannedSessions.update('ps-skipped', { carriedOut: ['Тяга в наклоне'] });
    expect((await db.plannedSessions.get('ps-skipped'))?.carriedOut).toEqual(['Тяга в наклоне']);
  });
});
