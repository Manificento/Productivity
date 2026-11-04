import { daysBetween } from '../dates';
import type { DateKey, WorkoutIntensity } from '../types';
import type { AdaptationContext, Baseline, ConditionRule, DailyTargets, PhaseRule } from './types';

export const DEFAULT_BASELINE: Baseline = {
  taskCapacityMin: 360,
  sleepHours: 7.5,
  bedtime: '23:30',
  maxWorkoutIntensity: 'hard',
  focusPomodoros: 4,
  meditationMin: 10,
  caffeineCutoff: '15:00',
};

export const BASELINE_SETTING_KEY = 'adaptation.baseline';

const INTENSITY_ORDER: WorkoutIntensity[] = ['rest', 'light', 'moderate', 'hard'];

/** Returns the lower of two intensities. */
export function capIntensity(current: WorkoutIntensity, cap: WorkoutIntensity): WorkoutIntensity {
  return INTENSITY_ORDER.indexOf(current) <= INTENSITY_ORDER.indexOf(cap) ? current : cap;
}

/** Shifts 'HH:mm' by minutes, wrapping around midnight. */
export function shiftTime(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + deltaMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Earlier of two 'HH:mm' times (same day). */
export function earlierTime(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Rounds minutes to the nearest 15. */
export function roundCapacity(min: number): number {
  return Math.max(0, Math.round(min / 15) * 15);
}

/**
 * Phase table. Values are deliberately conservative "suggestions for the day",
 * not medical advice; the user can override them in the UI.
 */
export const PHASE_RULES: PhaseRule[] = [
  {
    phase: 'prep',
    apply: (t, e) => ({
      ...t,
      focusProjectId: e.projectId,
      focusPomodoros: t.focusPomodoros + e.importance,
      allowDeferLowPriority: true,
      sleepHours: Math.max(t.sleepHours, 8),
      maxWorkoutIntensity: capIntensity(t.maxWorkoutIntensity, 'moderate'),
      meditationMin: t.meditationMin + 5,
      reasons: [
        ...t.reasons,
        `Подготовка к «${e.title}»: +${e.importance} фокус-сессии на проект события`,
        'Сон не меньше 8 ч, тренировки не выше умеренной интенсивности',
      ],
    }),
  },
  {
    phase: 'taper',
    apply: (t, e) => ({
      ...t,
      focusProjectId: e.projectId,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.6),
      focusPomodoros: 2,
      allowDeferLowPriority: true,
      sleepHours: Math.max(t.sleepHours, 8.5),
      bedtime: shiftTime(t.bedtime, -30),
      maxWorkoutIntensity: capIntensity(t.maxWorkoutIntensity, 'light'),
      meditationMin: t.meditationMin + 10,
      caffeineCutoff: earlierTime(t.caffeineCutoff, '14:00'),
      noNewFoods: true,
      reasons: [
        ...t.reasons,
        `Завтра «${e.title}»: разгрузочный день, нагрузка −40%`,
        'Отбой на 30 минут раньше, без новых продуктов, кофеин до 14:00',
      ],
    }),
  },
  {
    phase: 'event',
    apply: (t, e) => ({
      ...t,
      focusProjectId: e.projectId,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.3),
      focusPomodoros: 0,
      allowDeferLowPriority: true,
      maxWorkoutIntensity: 'rest',
      noNewFoods: true,
      reasons: [...t.reasons, `Сегодня «${e.title}»: только самое важное, без тренировки`],
    }),
  },
  {
    phase: 'recovery',
    apply: (t, e) => ({
      ...t,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.7),
      sleepHours: Math.max(t.sleepHours, 8),
      maxWorkoutIntensity: capIntensity(t.maxWorkoutIntensity, 'light'),
      reasons: [...t.reasons, `День после «${e.title}»: восстановление, нагрузка −30%`],
    }),
  },
];

const SLEEP_DEBT_NIGHTS = 3;
const SLEEP_DEBT_HOURS = 6.5;
const HARD_RPE = 8;

/** Events from today up to 3 days ahead, soonest first (for the overload rule). */
function upcomingWithin3Days(ctx: AdaptationContext, date: DateKey) {
  return ctx.events
    .filter((e) => {
      const d = daysBetween(date, e.date);
      return d >= 0 && d <= 3;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const CONDITION_RULES: ConditionRule[] = [
  {
    id: 'short-sleep',
    when: (ctx) => ctx.lastSleepHours !== undefined && ctx.lastSleepHours < 6,
    apply: (t, ctx) => ({
      ...t,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.8),
      maxWorkoutIntensity: capIntensity(t.maxWorkoutIntensity, 'light'),
      reasons: [
        ...t.reasons,
        `Сон прошлой ночью ${ctx.lastSleepHours!.toFixed(1)} ч: нагрузка −20%, тренировка не выше лёгкой`,
      ],
    }),
  },
  {
    id: 'low-energy',
    when: (ctx) => ctx.checkIn !== undefined && ctx.checkIn.energy <= 2,
    apply: (t) => ({
      ...t,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.8),
      reasons: [...t.reasons, 'Низкая энергия в чек-ине: нагрузка −20%'],
    }),
  },
  {
    id: 'overload',
    when: (ctx, date) => upcomingWithin3Days(ctx, date).length >= 2,
    apply: (t, ctx) => ({
      ...t,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.9),
      reasons: [
        ...t.reasons,
        `Два события за 3 дня (${upcomingWithin3Days(ctx, t.date)
          .map((e) => `«${e.title}»`)
          .join(', ')}): ёмкость −10%`,
      ],
    }),
  },
  {
    id: 'sleep-debt',
    when: (ctx) => {
      const nights = ctx.recentSleepHours?.slice(0, SLEEP_DEBT_NIGHTS) ?? [];
      return nights.length === SLEEP_DEBT_NIGHTS && nights.every((h) => h !== undefined && h < SLEEP_DEBT_HOURS);
    },
    apply: (t) => ({
      ...t,
      bedtime: shiftTime(t.bedtime, -30),
      reasons: [...t.reasons, 'Три ночи подряд меньше 6,5 ч сна: отбой на 30 минут раньше'],
    }),
  },
  {
    id: 'hard-workout-yesterday',
    when: (ctx) => ctx.yesterdayMaxRpe !== undefined && ctx.yesterdayMaxRpe >= HARD_RPE,
    apply: (t, ctx) => ({
      ...t,
      maxWorkoutIntensity: capIntensity(t.maxWorkoutIntensity, 'moderate'),
      reasons: [...t.reasons, `Вчера тяжёлая тренировка (RPE ${ctx.yesterdayMaxRpe}): сегодня не выше умеренной`],
    }),
  },
];

/** Starting targets for a normal day. */
export function baselineTargets(date: string, b: Baseline): DailyTargets {
  return {
    date,
    phase: 'normal',
    taskCapacityMin: b.taskCapacityMin,
    allowDeferLowPriority: false,
    sleepHours: b.sleepHours,
    bedtime: b.bedtime,
    maxWorkoutIntensity: b.maxWorkoutIntensity,
    focusPomodoros: b.focusPomodoros,
    meditationMin: b.meditationMin,
    caffeineCutoff: b.caffeineCutoff,
    noNewFoods: false,
    reasons: [],
  };
}
