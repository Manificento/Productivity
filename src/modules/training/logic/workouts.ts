import { startOfWeek } from 'date-fns';
import { fromDateKey, shiftDateKey, toDateKey } from '../../../core/dates';
import type { WorkoutInput } from '../../../core/logging/workout';
import type { DateKey, WorkoutLog } from '../../../core/types';

export const WORKOUT_TYPES = ['Силовая', 'Бег', 'Велосипед', 'Плавание', 'Йога', 'Ходьба', 'Другое'] as const;

/** Form state: everything is a string, as typed. */
export interface SetDraft {
  reps: string;
  weightKg: string;
}
export interface ExerciseDraft {
  name: string;
  sets: SetDraft[];
}
export interface WorkoutDraft {
  date: DateKey;
  type: string;
  durationMin: string;
  rpe: string;
  exercises: ExerciseDraft[];
  note: string;
}

/** The shared contract of `saveWorkout()` — the form produces exactly what core validates. */
export type { WorkoutInput };

export function emptyDraft(today: DateKey): WorkoutDraft {
  return { date: today, type: WORKOUT_TYPES[0], durationMin: '', rpe: '', exercises: [], note: '' };
}

/** «Повторить»: the past workout's data, dated today. */
export function draftFromWorkout(w: WorkoutLog, today: DateKey): WorkoutDraft {
  return {
    date: today,
    type: w.type,
    durationMin: String(w.durationMin),
    rpe: String(w.rpe),
    exercises: (w.exercises ?? []).map((e) => ({
      name: e.name,
      sets: e.sets.map((s) => ({ reps: s.reps?.toString() ?? '', weightKg: s.weightKg?.toString() ?? '' })),
    })),
    note: w.note ?? '',
  };
}

type Parsed = { ok: true; value: WorkoutInput } | { ok: false; error: string };

/** '' → undefined; '82,5' → 82.5; anything else non-numeric or negative → NaN. */
function optionalNumber(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

/** Validates the form. Empty set rows and empty exercises are dropped. */
export function parseDraft(d: WorkoutDraft, today: DateKey): Parsed {
  const type = d.type.trim();
  if (!type) return { ok: false, error: 'Выберите тип тренировки' };
  if (!d.date) return { ok: false, error: 'Укажите дату' };
  if (d.date > today) return { ok: false, error: 'Дата тренировки не может быть в будущем' };
  const durationMin = Number(d.durationMin);
  if (!d.durationMin.trim() || !Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1_440) {
    return { ok: false, error: 'Укажите длительность в минутах' };
  }
  const rpe = Number(d.rpe);
  if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return { ok: false, error: 'RPE — от 1 до 10' };

  const exercises: NonNullable<WorkoutLog['exercises']> = [];
  for (const e of d.exercises) {
    const sets: { reps?: number; weightKg?: number }[] = [];
    for (const s of e.sets) {
      const reps = optionalNumber(s.reps);
      const weightKg = optionalNumber(s.weightKg);
      if (Number.isNaN(reps) || Number.isNaN(weightKg) || (reps !== undefined && !Number.isInteger(reps))) {
        return { ok: false, error: 'Повторы и вес — неотрицательные числа' };
      }
      if (reps === undefined && weightKg === undefined) continue;
      sets.push({ ...(reps !== undefined && { reps }), ...(weightKg !== undefined && { weightKg }) });
    }
    const name = e.name.trim();
    if (!name && sets.length === 0) continue;
    if (!name) return { ok: false, error: 'Укажите название упражнения' };
    exercises.push({ name, sets });
  }

  const note = d.note.trim();
  return {
    ok: true,
    value: {
      date: d.date,
      type,
      durationMin,
      rpe,
      ...(exercises.length > 0 && { exercises }),
      ...(note && { note }),
    },
  };
}

export interface WeekStats {
  minutes: number;
  count: number;
  /** Undefined when there were no workouts. */
  avgRpe?: number;
}

/** First day (Monday) of the week containing `day`. */
export function weekStart(day: DateKey): DateKey {
  return toDateKey(startOfWeek(fromDateKey(day), { weekStartsOn: 1 }));
}

/** Totals for the calendar week (Mon–Sun) containing `today`. */
export function weekStats(workouts: WorkoutLog[], today: DateKey): WeekStats {
  const from = weekStart(today);
  const to = shiftDateKey(from, 6);
  const week = workouts.filter((w) => w.date >= from && w.date <= to);
  if (week.length === 0) return { minutes: 0, count: 0 };
  return {
    minutes: week.reduce((sum, w) => sum + w.durationMin, 0),
    count: week.length,
    avgRpe: Math.round((week.reduce((sum, w) => sum + w.rpe, 0) / week.length) * 10) / 10,
  };
}

/** '10 × 60 кг, 8 повт., 20 кг' */
export function formatSets(sets: { reps?: number; weightKg?: number }[]): string {
  return sets
    .map((s) =>
      s.reps !== undefined && s.weightKg !== undefined
        ? `${s.reps} × ${formatNumber(s.weightKg)} кг`
        : s.reps !== undefined
          ? `${s.reps} повт.`
          : `${formatNumber(s.weightKg ?? 0)} кг`,
    )
    .join(', ');
}

/** 6.5 → '6,5' */
export function formatNumber(n: number): string {
  return n.toString().replace('.', ',');
}
