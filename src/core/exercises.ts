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

// Compile-time: every `MuscleGroup` is listed above (a new member missing here would be rejected by `saveWorkout`).
type Unlisted = Exclude<MuscleGroup, (typeof MUSCLE_GROUPS)[number]>;
export const MUSCLE_GROUPS_COMPLETE: [Unlisted] extends [never] ? true : never = true;

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
  {
    name: 'Приседания',
    aliases: ['Присед', 'Squat', 'Squats', 'Back squat'],
    muscleGroups: ['legs', 'glutes', 'core'],
  },
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

/** A duration or distance at the end of a name: «Длинный бег 45 минут», «Easy run 5 km», «Планка 60 сек». */
const TRAILING_AMOUNT = / \d+ ?(минут[аыу]?|мин|min|mins|minutes?|секунд[аыу]?|сек|sec|secs|seconds?|с|s|км|km|м|m)$/;

/**
 * The comparable form of an exercise name: lower case, «ё» → «е», punctuation and hyphens as spaces,
 * single spaces, no trailing duration or distance.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(TRAILING_AMOUNT, '');
}

const BY_NAME = new Map<string, readonly MuscleGroup[]>(
  STARTER_EXERCISES.flatMap((e) => [e.name, ...e.aliases].map((n) => [normalizeExerciseName(n), e.muscleGroups])),
);

/** Muscle groups of a starter exercise by its Russian or English name; `[]` when the exercise is unknown. */
export function muscleGroupsOf(name: string): MuscleGroup[] {
  return [...(BY_NAME.get(normalizeExerciseName(name)) ?? [])];
}
