import type { WorkoutInput } from '../../../core/logging/workout';
import { WORKOUT_TYPES } from './workouts';
import { normalizeExerciseName } from '../../../core/exercises';
import type { DateKey, ProgramExercise } from '../../../core/types';

/** One exercise of the session being performed: which of its planned sets are checked off. */
export interface SessionExerciseDraft {
  exercise: ProgramExercise;
  done: boolean[];
}

export function draftFromExercises(exercises: ProgramExercise[]): SessionExerciseDraft[] {
  return exercises.map((exercise) => ({ exercise, done: Array.from({ length: exercise.sets }, () => false) }));
}

export function toggleSet(draft: SessionExerciseDraft[], exIndex: number, setIndex: number): SessionExerciseDraft[] {
  return draft.map((e, i) => (i === exIndex ? { ...e, done: e.done.map((d, j) => (j === setIndex ? !d : d)) } : e));
}

/** Workout type for a program: its own name when it is a known type («Бег»), «Силовая» for strength, else «Другое». */
export function workoutTypeFor(programName: string): string {
  if ((WORKOUT_TYPES as readonly string[]).includes(programName)) return programName;
  return programName.startsWith('Сила') ? 'Силовая' : 'Другое';
}

export type BuildResult = { ok: true; value: WorkoutInput } | { ok: false; error: string };

/** Turns the checked sets into the `saveWorkout()` input. Done sets carry the planned reps / weight. */
export function buildWorkout(
  draft: SessionExerciseDraft[],
  fields: { date: DateKey; durationMin: string; rpe: string; type?: string },
): BuildResult {
  const exercises = draft
    .map(({ exercise, done }) => ({
      name: exercise.name,
      ...(exercise.muscleGroups && { muscleGroups: exercise.muscleGroups }),
      sets: done.filter(Boolean).map(() => ({
        ...(exercise.reps !== undefined && { reps: exercise.reps }),
        ...(exercise.weightKg !== undefined && { weightKg: exercise.weightKg }),
      })),
    }))
    .filter((e) => e.sets.length > 0);
  if (exercises.length === 0) return { ok: false, error: 'Отметьте хотя бы один подход' };
  const durationMin = Number(fields.durationMin.trim().replace(',', '.'));
  if (fields.durationMin.trim() === '' || !Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440)
    return { ok: false, error: 'Укажите длительность в минутах' };
  const rpe = Number(fields.rpe.trim());
  if (fields.rpe.trim() === '' || !Number.isInteger(rpe) || rpe < 1 || rpe > 10)
    return { ok: false, error: 'RPE — от 1 до 10' };
  return { ok: true, value: { date: fields.date, type: fields.type ?? 'Силовая', durationMin, rpe, exercises } };
}

/**
 * A stable id per exercise of a session while it is being performed: the program's own exercises by position (they
 * are never removed), carried ones by origin day and name. Checked sets follow the exercise when a carried one is
 * removed or added (#226).
 */
export function exerciseIds(exercises: ProgramExercise[]): string[] {
  const seen = new Map<string, number>();
  let own = 0;
  return exercises.map((e) => {
    if (e.carriedFrom === undefined) return `own:${own++}`;
    const base = `carried:${e.carriedFrom}:${normalizeExerciseName(e.name)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}
