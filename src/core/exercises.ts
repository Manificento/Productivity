import type { MuscleGroup } from './types';

/** Every `MuscleGroup`, in display order. */
export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
  'cardio',
  'mobility',
] as const satisfies readonly MuscleGroup[];

export interface StarterExercise {
  /** Name as the training templates spell it. */
  name: string;
  /** Other spellings (English, short forms) that mean the same exercise. */
  aliases: string[];
  /** Main groups first. */
  muscleGroups: MuscleGroup[];
}

/**
 * Starter exercises (the training templates) and the muscles they load. Read by training (smart rescheduling)
 * and by analytics; extend it here, not in a module.
 */
export const STARTER_EXERCISES: readonly StarterExercise[] = [
  { name: 'Приседания', aliases: ['Присед', 'Squat', 'Squats', 'Back squat'], muscleGroups: ['legs', 'glutes', 'core'] },
  { name: 'Жим лёжа', aliases: ['Bench press', 'Bench'], muscleGroups: ['chest', 'shoulders', 'arms'] },
  {
    name: 'Тяга в наклоне',
    aliases: ['Тяга штанги в наклоне', 'Bent-over row', 'Barbell row'],
    muscleGroups: ['back', 'arms'],
  },
  { name: 'Румынская тяга', aliases: ['Romanian deadlift', 'RDL'], muscleGroups: ['legs', 'glutes', 'back'] },
  {
    name: 'Жим стоя',
    aliases: ['Армейский жим', 'Overhead press', 'Military press', 'OHP'],
    muscleGroups: ['shoulders', 'arms', 'core'],
  },
  { name: 'Подтягивания', aliases: ['Pull-up', 'Pull-ups', 'Pullups', 'Chin-ups'], muscleGroups: ['back', 'arms'] },
  { name: 'Отжимания на брусьях', aliases: ['Брусья', 'Dips'], muscleGroups: ['chest', 'arms', 'shoulders'] },
  { name: 'Планка', aliases: ['Plank'], muscleGroups: ['core'] },
  {
    name: 'Лёгкий бег',
    aliases: ['Бег', 'Easy run', 'Run', 'Running', 'Длинный бег', 'Long run'],
    muscleGroups: ['cardio', 'legs'],
  },
  { name: 'Интервалы по 2 минуты', aliases: ['Интервалы', 'Intervals'], muscleGroups: ['cardio', 'legs'] },
  { name: 'Растяжка всего тела', aliases: ['Растяжка', 'Stretching', 'Stretch'], muscleGroups: ['mobility'] },
];

/** A duration at the end of a name: «Длинный бег 45 минут», «Easy run 20 min». */
const TRAILING_DURATION = / \d+ ?(минут[аы]?|мин|min|mins|minutes?)$/;

/**
 * The comparable form of an exercise name: lower case, «ё» → «е», punctuation and hyphens as spaces,
 * single spaces, no trailing duration.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(TRAILING_DURATION, '');
}

const BY_NAME = new Map<string, readonly MuscleGroup[]>(
  STARTER_EXERCISES.flatMap((e) => [e.name, ...e.aliases].map((n) => [normalizeExerciseName(n), e.muscleGroups])),
);

/** Muscle groups of a starter exercise by its Russian or English name; `[]` when the exercise is unknown. */
export function muscleGroupsOf(name: string): MuscleGroup[] {
  return [...(BY_NAME.get(normalizeExerciseName(name)) ?? [])];
}
