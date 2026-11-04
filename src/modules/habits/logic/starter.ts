import type { HabitFields } from './habitForm';
import { HABIT_COLORS } from './habitForm';

/** Habits offered on an empty screen. Names are what the user sees; schedules are sensible defaults. */
export const STARTER_HABITS: readonly HabitFields[] = [
  { name: 'Медитация', schedule: { kind: 'daily' }, color: HABIT_COLORS[5] },
  { name: 'Чтение 20 мин', schedule: { kind: 'daily' }, color: HABIT_COLORS[1] },
  { name: 'Английский', schedule: { kind: 'daily' }, color: HABIT_COLORS[0] },
  { name: 'Тренировка', schedule: { kind: 'timesPerWeek', timesPerWeek: 3 }, color: HABIT_COLORS[4] },
  { name: 'Отбой вовремя', schedule: { kind: 'daily' }, color: HABIT_COLORS[2] },
];

/** The starter habits picked by name, in the offered order; unknown names are ignored. */
export function pickStarter(names: ReadonlySet<string>): HabitFields[] {
  return STARTER_HABITS.filter((h) => names.has(h.name));
}
