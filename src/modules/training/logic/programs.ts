import { shiftDateKey, fromDateKey } from '../../../core/dates';
import type { DateKey, ProgramDay, ProgramExercise } from '../../../core/types';

/** Weekdays Monday-first (0 = Sunday … 6 = Saturday, as in `ProgramDay.weekday`). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

/** Comparator: Monday first, Sunday last. */
export const byWeekdayOrder = (a: { weekday: number }, b: { weekday: number }): number =>
  (WEEKDAY_ORDER as readonly number[]).indexOf(a.weekday) - (WEEKDAY_ORDER as readonly number[]).indexOf(b.weekday);

export const DEFAULT_WEEKS = 4;

export interface ProgramTemplate {
  name: string;
  days: ProgramDay[];
}

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    name: 'Сила 3 раза в неделю',
    days: [
      {
        weekday: 1,
        exercises: [
          { name: 'Приседания', sets: 3, reps: 8 },
          { name: 'Жим лёжа', sets: 3, reps: 8 },
          { name: 'Тяга в наклоне', sets: 3, reps: 10 },
        ],
      },
      {
        weekday: 3,
        exercises: [
          { name: 'Румынская тяга', sets: 3, reps: 8 },
          { name: 'Жим стоя', sets: 3, reps: 8 },
          { name: 'Подтягивания', sets: 3, reps: 6 },
        ],
      },
      {
        weekday: 5,
        exercises: [
          { name: 'Приседания', sets: 3, reps: 8 },
          { name: 'Отжимания на брусьях', sets: 3, reps: 10 },
          { name: 'Планка', sets: 3 },
        ],
      },
    ],
  },
  {
    name: 'Бег',
    days: [
      { weekday: 2, exercises: [{ name: 'Лёгкий бег 30 минут', sets: 1, rpeTarget: 5 }] },
      { weekday: 4, exercises: [{ name: 'Интервалы по 2 минуты', sets: 6, rpeTarget: 8 }] },
      { weekday: 6, exercises: [{ name: 'Длинный бег 45 минут', sets: 1, rpeTarget: 6 }] },
    ],
  },
  {
    name: 'Растяжка',
    days: [
      { weekday: 2, exercises: [{ name: 'Растяжка всего тела', sets: 1 }] },
      { weekday: 4, exercises: [{ name: 'Растяжка всего тела', sets: 1 }] },
      { weekday: 0, exercises: [{ name: 'Растяжка всего тела', sets: 1 }] },
    ],
  },
];

// ---------- plan ----------

export interface PlannedDay {
  date: DateKey;
  exercises: ProgramExercise[];
}

/** Sessions for `weeks` weeks from `start` (inclusive): one per matching weekday, exercises copied. */
export function planSessions(days: ProgramDay[], start: DateKey, weeks: number): PlannedDay[] {
  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const out: PlannedDay[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = shiftDateKey(start, i);
    const day = byWeekday.get(fromDateKey(date).getDay());
    if (day) out.push({ date, exercises: day.exercises.map((e) => ({ ...e })) });
  }
  return out;
}

/** The session of a given day, or undefined — «день отдыха». */
export function sessionOn<T extends { date: DateKey }>(sessions: T[], date: DateKey): T | undefined {
  return sessions.find((s) => s.date === date);
}

// ---------- draft ----------

export interface ExerciseDraft {
  name: string;
  sets: string;
  reps: string;
  weightKg: string;
  rpeTarget: string;
}
export interface DayDraft {
  weekday: number;
  exercises: ExerciseDraft[];
}
export interface ProgramDraft {
  name: string;
  weeks: number;
  days: DayDraft[];
}

export const emptyExercise = (): ExerciseDraft => ({ name: '', sets: '3', reps: '', weightKg: '', rpeTarget: '' });
export const emptyProgramDraft = (): ProgramDraft => ({ name: '', weeks: DEFAULT_WEEKS, days: [] });

export function draftFromTemplate(t: ProgramTemplate): ProgramDraft {
  return {
    name: t.name,
    weeks: DEFAULT_WEEKS,
    days: t.days.map((d) => ({
      weekday: d.weekday,
      exercises: d.exercises.map((e) => ({
        name: e.name,
        sets: String(e.sets),
        reps: e.reps === undefined ? '' : String(e.reps),
        weightKg: e.weightKg === undefined ? '' : String(e.weightKg),
        rpeTarget: e.rpeTarget === undefined ? '' : String(e.rpeTarget),
      })),
    })),
  };
}

export interface ProgramInput {
  name: string;
  weeks: number;
  days: ProgramDay[];
}

export type ParseResult = { ok: true; value: ProgramInput } | { ok: false; error: string };

const num = (s: string): number => Number(s.trim().replace(',', '.'));

export function parseProgramDraft(draft: ProgramDraft): ParseResult {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Введите название программы' };
  if (draft.days.length === 0) return { ok: false, error: 'Добавьте хотя бы один день' };
  const days: ProgramDay[] = [];
  for (const d of draft.days) {
    if (d.exercises.length === 0) return { ok: false, error: 'Добавьте упражнение в каждый день' };
    const exercises: ProgramExercise[] = [];
    for (const e of d.exercises) {
      const exName = e.name.trim();
      if (!exName) return { ok: false, error: 'У упражнения должно быть название' };
      const sets = num(e.sets);
      if (!Number.isInteger(sets) || sets < 1 || e.sets.trim() === '')
        return { ok: false, error: 'Подходы — целое число от 1' };
      const ex: ProgramExercise = { name: exName, sets };
      if (e.reps.trim() !== '') {
        const reps = num(e.reps);
        if (!Number.isInteger(reps) || reps < 1) return { ok: false, error: 'Повторы — целое число от 1' };
        ex.reps = reps;
      }
      if (e.weightKg.trim() !== '') {
        const w = num(e.weightKg);
        if (!Number.isFinite(w) || w < 0) return { ok: false, error: 'Вес — число не меньше 0' };
        ex.weightKg = w;
      }
      if (e.rpeTarget.trim() !== '') {
        const rpe = num(e.rpeTarget);
        if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return { ok: false, error: 'RPE — целое число от 1 до 10' };
        ex.rpeTarget = rpe;
      }
      exercises.push(ex);
    }
    days.push({ weekday: d.weekday, exercises });
  }
  days.sort(byWeekdayOrder);
  return { ok: true, value: { name, weeks: draft.weeks, days } };
}

export function exerciseLine(e: ProgramExercise): string {
  const parts = [e.reps === undefined ? `${e.sets} подх.` : `${e.sets} × ${e.reps}`];
  if (e.weightKg !== undefined) parts.push(`${e.weightKg} кг`);
  if (e.rpeTarget !== undefined) parts.push(`RPE ${e.rpeTarget}`);
  return `${e.name}: ${parts.join(', ')}`;
}
