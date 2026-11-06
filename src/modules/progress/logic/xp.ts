import { shiftDateKey, toDateKey } from '../../../core/dates';
import type {
  CognitiveTest,
  DateKey,
  HabitLog,
  MeditationSession,
  MindSession,
  SleepLog,
  Task,
  TimeEntry,
  WorkoutLog,
} from '../../../core/types';

/** XP per completed action. Experience is derived from the block tables, never stored. */
export const XP_RULES = {
  task: 10,
  habit: 5,
  focus: 10,
  sleep: 5,
  workout: 15,
  meditation: 5,
  test: 5,
} as const;

/** The slices of the block tables that earn experience. */
export interface XpSources {
  tasks: readonly Task[];
  habitLogs: readonly HabitLog[];
  timeEntries: readonly TimeEntry[];
  sleepLogs: readonly SleepLog[];
  workoutLogs: readonly WorkoutLog[];
  meditationSessions: readonly MeditationSession[];
  cognitiveTests: readonly CognitiveTest[];
  mindSessions: readonly MindSession[];
}

export interface XpGain {
  date: DateKey;
  amount: number;
}

/** One gain per qualifying record; a record that is undone or deleted simply stops appearing. */
export function xpEventsFrom(s: XpSources): XpGain[] {
  const out: XpGain[] = [];
  for (const t of s.tasks)
    if (t.completedAt !== undefined) out.push({ date: toDateKey(t.completedAt), amount: XP_RULES.task });
  for (const h of s.habitLogs) if (h.done) out.push({ date: h.date, amount: XP_RULES.habit });
  for (const e of s.timeEntries)
    if (e.source === 'pomodoro' && e.end !== undefined) out.push({ date: e.date, amount: XP_RULES.focus });
  for (const l of s.sleepLogs) out.push({ date: l.date, amount: XP_RULES.sleep });
  for (const w of s.workoutLogs) out.push({ date: w.date, amount: XP_RULES.workout });
  for (const m of s.meditationSessions) if (m.completed) out.push({ date: m.date, amount: XP_RULES.meditation });
  for (const c of s.cognitiveTests) out.push({ date: c.date, amount: XP_RULES.test });
  for (const m of s.mindSessions) out.push({ date: m.date, amount: XP_RULES.test });
  return out;
}

export function totalXp(s: XpSources): number {
  return xpEventsFrom(s).reduce((sum, e) => sum + e.amount, 0);
}

/** XP needed to go from `level` to `level + 1`: 100, 150, 200, … */
export function xpForLevel(level: number): number {
  return 50 + 50 * level;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level costs. */
  needed: number;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level += 1;
  }
  return { level, into: rest, needed: xpForLevel(level) };
}

export interface ProgressSummary extends LevelInfo {
  total: number;
  today: number;
  /** The last 7 days including today. */
  week: number;
}

export function summarize(s: XpSources, today: DateKey): ProgressSummary {
  const events = xpEventsFrom(s);
  const weekStart = shiftDateKey(today, -6);
  let total = 0;
  let todayXp = 0;
  let week = 0;
  for (const e of events) {
    total += e.amount;
    if (e.date === today) todayXp += e.amount;
    if (e.date >= weekStart && e.date <= today) week += e.amount;
  }
  return { total, today: todayXp, week, ...levelFromXp(total) };
}

/** What earns experience, for the empty state. */
export const XP_HINTS: readonly { label: string; xp: number }[] = [
  { label: 'Выполненная задача', xp: XP_RULES.task },
  { label: 'Отметка привычки', xp: XP_RULES.habit },
  { label: 'Фокус-сессия', xp: XP_RULES.focus },
  { label: 'Запись сна', xp: XP_RULES.sleep },
  { label: 'Тренировка', xp: XP_RULES.workout },
  { label: 'Завершённая медитация', xp: XP_RULES.meditation },
  { label: 'Тест или тренажёр', xp: XP_RULES.test },
];
