import { shiftDateKey, toDateKey } from '../../../core/dates';
import { atLocalTime } from '../../../core/logging/sleepTime';
import type {
  CognitiveTest,
  DateKey,
  HabitLog,
  MealLog,
  MeditationSession,
  MindSession,
  SleepLog,
  Task,
  TimeEntry,
  WorkoutLog,
  XpEvent,
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
  meal: 3,
  /** Bonus for a finished daily quest (written to `xpEvents`). */
  quest: 20,
} as const;

/** The six skills; each block's XP flows into one of them. */
export const SKILLS = [
  { id: 'tasks', label: 'Дела' },
  { id: 'body', label: 'Тело' },
  { id: 'sleep', label: 'Сон' },
  { id: 'food', label: 'Питание' },
  { id: 'mind', label: 'Ум' },
  { id: 'calm', label: 'Покой' },
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];

/** Which skill a quest bonus belongs to (`xpEvents.questId`). */
export const QUEST_SKILL: Record<string, SkillId> = {
  focus: 'tasks',
  habits: 'tasks',
  bedtime: 'sleep',
  meditation: 'calm',
  breathing: 'calm',
};

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
  mealLogs: readonly MealLog[];
  /** Quest bonuses — the only experience that is stored. */
  xpEvents: readonly XpEvent[];
}

/** A focus session is a pomodoro of at least 10 minutes (the `time` module's rule, #16; no cross-module import). */
export const MIN_FOCUS_MS = 10 * 60_000;

/**
 * At most this much base experience counts per calendar day, for live actions and imported history alike (#224):
 * a year of imported history gives roughly a year of live use, not the maximum level. Quest bonuses are outside the cap.
 */
export const DAILY_XP_CAP = 100;

const DAY_MS = 24 * 3_600_000;

/**
 * A night carried over from another app (#236): it has a `sourceId` and was recorded more than a day after its day
 * ended. A fresh night from a watch's daily import (recorded the same or the next day) is lived experience, like a
 * night entered by hand; a night without `sourceId` is never history, however late it was written.
 */
export function isImportedNight(l: SleepLog): boolean {
  return l.sourceId !== undefined && l.createdAt > atLocalTime(shiftDateKey(l.date, 1), '00:00') + DAY_MS;
}

export interface XpGain {
  date: DateKey;
  skill: SkillId;
  amount: number;
  /** Comes from a record imported from another app (`Task.source`, `WorkoutLog.sourceId`). */
  imported?: boolean;
  /** Quest bonus (`xpEvents`) — not capped and never granted retroactively by an import. */
  bonus?: boolean;
}

/** One gain per qualifying record; a record that is undone or deleted simply stops appearing. */
export function xpEventsFrom(s: XpSources): XpGain[] {
  const out: XpGain[] = [];
  const add = (date: DateKey, skill: SkillId, amount: number, imported = false) =>
    out.push(imported ? { date, skill, amount, imported } : { date, skill, amount });
  for (const t of s.tasks)
    if (t.completedAt !== undefined) add(toDateKey(t.completedAt), 'tasks', XP_RULES.task, t.source !== undefined);
  for (const h of s.habitLogs) if (h.done) add(h.date, 'tasks', XP_RULES.habit);
  for (const e of s.timeEntries)
    if (e.source === 'pomodoro' && e.end !== undefined && e.end - e.start >= MIN_FOCUS_MS)
      add(e.date, 'tasks', XP_RULES.focus);
  for (const l of s.sleepLogs) add(l.date, 'sleep', XP_RULES.sleep, isImportedNight(l));
  for (const w of s.workoutLogs) add(w.date, 'body', XP_RULES.workout, w.sourceId !== undefined);
  for (const m of s.meditationSessions) if (m.completed) add(m.date, 'calm', XP_RULES.meditation);
  for (const c of s.cognitiveTests) add(c.date, 'mind', XP_RULES.test);
  for (const m of s.mindSessions) add(m.date, 'mind', XP_RULES.test);
  for (const m of s.mealLogs) add(m.date, 'food', XP_RULES.meal);
  for (const q of s.xpEvents)
    out.push({ date: q.date, skill: QUEST_SKILL[q.questId] ?? 'tasks', amount: q.amount, bonus: true });
  return out;
}

/**
 * Gains that actually count: base experience is limited to `DAILY_XP_CAP` per day. A day over the cap is scaled
 * down proportionally (largest remainder, so the day sums to exactly the cap), so every block and skill keeps its
 * share and the result does not depend on table order. Quest bonuses pass through untouched.
 */
export function countedGains(s: XpSources): XpGain[] {
  const gains = xpEventsFrom(s);
  const byDay = new Map<DateKey, XpGain[]>();
  for (const g of gains) if (!g.bonus) byDay.set(g.date, [...(byDay.get(g.date) ?? []), g]);
  const out: XpGain[] = gains.filter((g) => g.bonus);
  for (const day of byDay.values()) {
    const sum = day.reduce((t, g) => t + g.amount, 0);
    if (sum <= DAILY_XP_CAP) {
      out.push(...day);
      continue;
    }
    const exact = day.map((g) => (g.amount * DAILY_XP_CAP) / sum);
    const amounts = exact.map(Math.floor);
    let spare = DAILY_XP_CAP - amounts.reduce((t, a) => t + a, 0);
    const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((x, y) => y.frac - x.frac || x.i - y.i);
    for (const { i } of order) {
      if (spare <= 0) break;
      amounts[i] = (amounts[i] ?? 0) + 1;
      spare -= 1;
    }
    day.forEach((g, i) => {
      const amount = amounts[i] ?? 0;
      if (amount > 0) out.push({ ...g, amount });
    });
  }
  return out;
}

export function totalXp(s: XpSources): number {
  return countedGains(s).reduce((sum, e) => sum + e.amount, 0);
}

/** Counted experience that came from imported history — shown apart from experience for live actions. */
export function importedXp(s: XpSources): number {
  return countedGains(s).reduce((sum, e) => sum + (e.imported ? e.amount : 0), 0);
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

export interface SkillLevel extends LevelInfo {
  id: SkillId;
  label: string;
  xp: number;
}

/** Level of each of the six skills from the XP that flows into it. */
export function skillLevels(s: XpSources): SkillLevel[] {
  const sums = new Map<SkillId, number>();
  for (const e of countedGains(s)) sums.set(e.skill, (sums.get(e.skill) ?? 0) + e.amount);
  return SKILLS.map((k) => {
    const xp = sums.get(k.id) ?? 0;
    return { id: k.id, label: k.label, xp, ...levelFromXp(xp) };
  });
}

export interface ProgressSummary extends LevelInfo {
  total: number;
  /** Part of `total` carried over from imported history. */
  imported: number;
  today: number;
  /** The last 7 days including today. */
  week: number;
}

export function summarize(s: XpSources, today: DateKey): ProgressSummary {
  const events = countedGains(s);
  const weekStart = shiftDateKey(today, -6);
  let total = 0;
  let imported = 0;
  let todayXp = 0;
  let week = 0;
  for (const e of events) {
    total += e.amount;
    if (e.imported) imported += e.amount;
    if (e.date === today) todayXp += e.amount;
    if (e.date >= weekStart && e.date <= today) week += e.amount;
  }
  return { total, imported, today: todayXp, week, ...levelFromXp(total) };
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
  { label: 'Приём пищи в дневнике', xp: XP_RULES.meal },
  { label: 'Выполненный квест дня', xp: XP_RULES.quest },
];
