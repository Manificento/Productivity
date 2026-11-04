import type { Habit, HabitSchedule } from '../../../core/types';

export type ScheduleKind = HabitSchedule['kind'];

export interface HabitFormInput {
  name: string;
  kind: ScheduleKind;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  timesPerWeek: string;
  color: string;
}

export type HabitFields = Pick<Habit, 'name' | 'schedule' | 'color'>;

export type HabitFormResult =
  { ok: true; value: HabitFields } | { ok: false; field: 'name' | 'weekdays' | 'timesPerWeek'; error: string };

/** Monday-first order for the weekday picker. */
export const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Пн' },
  { day: 2, label: 'Вт' },
  { day: 3, label: 'Ср' },
  { day: 4, label: 'Чт' },
  { day: 5, label: 'Пт' },
  { day: 6, label: 'Сб' },
  { day: 0, label: 'Вс' },
];

export const HABIT_COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'] as const;

/** Validates the habit editor and builds a clean schedule (only the fields its kind uses). */
export function parseHabitForm(input: HabitFormInput): HabitFormResult {
  const name = input.name.trim();
  if (!name) return { ok: false, field: 'name', error: 'Введите название' };
  if (name.length > 80) return { ok: false, field: 'name', error: 'Название — до 80 символов' };

  let schedule: HabitSchedule;
  if (input.kind === 'weekdays') {
    const days = [...new Set(input.weekdays)]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (days.length === 0) return { ok: false, field: 'weekdays', error: 'Выберите хотя бы один день' };
    schedule = { kind: 'weekdays', weekdays: days };
  } else if (input.kind === 'timesPerWeek') {
    const raw = input.timesPerWeek.trim();
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < 1 || n > 7) {
      return { ok: false, field: 'timesPerWeek', error: 'Сколько раз в неделю: от 1 до 7' };
    }
    schedule = { kind: 'timesPerWeek', timesPerWeek: n };
  } else {
    schedule = { kind: 'daily' };
  }
  return { ok: true, value: { name, schedule, color: input.color } };
}

/** Form values for an existing habit (or defaults for a new one). */
export function habitFormValues(habit?: Pick<Habit, 'name' | 'schedule' | 'color'>): HabitFormInput {
  return {
    name: habit?.name ?? '',
    kind: habit?.schedule.kind ?? 'daily',
    weekdays: habit?.schedule.weekdays ?? [1, 2, 3, 4, 5],
    timesPerWeek: String(habit?.schedule.timesPerWeek ?? 3),
    color: habit?.color ?? HABIT_COLORS[0],
  };
}

/** Short Russian description of a schedule: «каждый день», «пн, ср, пт», «3 раза в неделю». */
export function describeSchedule(schedule: HabitSchedule): string {
  if (schedule.kind === 'daily') return 'каждый день';
  if (schedule.kind === 'weekdays') {
    const set = new Set(schedule.weekdays ?? []);
    return WEEKDAYS.filter((w) => set.has(w.day))
      .map((w) => w.label.toLowerCase())
      .join(', ');
  }
  const n = schedule.timesPerWeek ?? 1;
  return `${n} ${n >= 2 && n <= 4 ? 'раза' : 'раз'} в неделю`;
}
