import { daysBetween } from '../dates';
import type { DateKey, WorkoutIntensity } from '../types';
import type { AdaptationContext, Baseline, ConditionRule, DailyTargets, NutritionGoal, PhaseRule } from './types';

export const DEFAULT_BASELINE: Baseline = {
  taskCapacityMin: 360,
  sleepHours: 7.5,
  bedtime: '23:30',
  maxWorkoutIntensity: 'hard',
  focusPomodoros: 4,
  meditationMin: 10,
  caffeineCutoff: '15:00',
  wakeTime: '07:30',
  mindTrainingMin: 10,
};

/** Smart alarm window before the wake-up time, minutes. */
export const WAKE_WINDOW_MIN = 30;

const KCAL_PER_KG = 7700;
/** A deficit or a surplus is never bigger than this share of the expenditure. */
const MAX_CHANGE_SHARE = 0.25;

/**
 * Daily energy and macros from the expenditure (computed by the nutrition module), the goal and body weight.
 * `ratePct` is % of body weight per week (≥ 0). Protein 1.8 g/kg (1.6 when maintaining), fat 0.8 g/kg, carbs —
 * the rest (never below 0: for extreme inputs protein and fat may exceed `kcal`). With `noDeficit` (taper and
 * event days, rule 7) `kcal` is never below the expenditure; protein stays as for the goal.
 */
export function nutritionTargets(
  expenditureKcal: number,
  goal: NutritionGoal,
  weightKg: number,
  noDeficit = false,
): { kcal: number; proteinG: number; fatG: number; carbsG: number } {
  const change = Math.min((weightKg * (goal.ratePct / 100) * KCAL_PER_KG) / 7, expenditureKcal * MAX_CHANGE_SHARE);
  const raw =
    goal.kind === 'lose' ? expenditureKcal - change : goal.kind === 'gain' ? expenditureKcal + change : expenditureKcal;
  let kcal = Math.round(raw / 10) * 10;
  if (noDeficit) kcal = Math.max(kcal, Math.ceil(expenditureKcal / 10) * 10);
  const proteinG = Math.round(weightKg * (goal.kind === 'maintain' ? 1.6 : 1.8));
  const fatG = Math.round(weightKg * 0.8);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, fatG, carbsG };
}

/** Phase-independent part of the v2 taper/event rule (rule 7); calories are handled by the engine. */
function deloadDay(t: DailyTargets, reason: string): DailyTargets {
  return { ...t, deload: true, mindTrainingMin: Math.min(t.mindTrainingMin, 5), reasons: [...t.reasons, reason] };
}

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
    apply: (t, e) =>
      deloadDay(
        {
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
        },
        'Разгрузка: тренировка по плану облегчённая, тренажёры ума ≤ 5 мин',
      ),
  },
  {
    phase: 'event',
    apply: (t, e) =>
      deloadDay(
        {
          ...t,
          focusProjectId: e.projectId,
          taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.3),
          focusPomodoros: 0,
          allowDeferLowPriority: true,
          maxWorkoutIntensity: 'rest',
          noNewFoods: true,
          habitsMode: 'essential',
          meditationKind: 'breathing',
          reasons: [
            ...t.reasons,
            `Сегодня «${e.title}»: только самое важное, без тренировки`,
            'Только ключевые привычки, дыхательная медитация перед событием',
          ],
        },
        'Тренажёры ума — не больше 5 минут',
      ),
  },
  {
    phase: 'recovery',
    apply: (t, e) => ({
      ...t,
      taskCapacityMin: roundCapacity(t.taskCapacityMin * 0.7),
      sleepHours: Math.max(t.sleepHours, 8),
      maxWorkoutIntensity: capIntensity(t.maxWorkoutIntensity, 'light'),
      meditationKind: 'body',
      reasons: [...t.reasons, `День после «${e.title}»: восстановление, нагрузка −30%, медитация на тело`],
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

/** A personal PVT norm needs this many runs in 14 days. */
const PVT_MIN_RUNS = 7;
/** Today's median this much slower than the norm counts as low attention. */
const PVT_SLOWER_SHARE = 0.2;

/** Personal PVT norm: the median of the run medians of 14 days; undefined with fewer than 7 runs. */
export function pvtNorm(mediansMs: readonly number[]): number | undefined {
  if (mediansMs.length < PVT_MIN_RUNS) return undefined;
  const sorted = [...mediansMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
      mindTrainingMin: 0,
      reasons: [...t.reasons, 'Низкая энергия в чек-ине: нагрузка −20%, без тренажёров ума'],
    }),
  },
  {
    id: 'overload',
    when: (ctx, date) => upcomingWithin3Days(ctx, date).length >= 2,
    apply: (t, ctx) => {
      const capacity = roundCapacity(t.taskCapacityMin * 0.9);
      // A day already cut to the minimum may not shrink after rounding; then there is nothing to explain.
      if (capacity >= t.taskCapacityMin) return t;
      const events = upcomingWithin3Days(ctx, t.date);
      const titles = events.map((e) => `«${e.title}»`).join(', ');
      return {
        ...t,
        taskCapacityMin: capacity,
        reasons: [...t.reasons, `Событий за 3 дня: ${events.length} (${titles}) — ёмкость −10%`],
      };
    },
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
    apply: (t, ctx) => {
      const capped = capIntensity(t.maxWorkoutIntensity, 'moderate');
      // Only explain the cap when it changes something (prep, taper or short sleep may already be lower).
      if (capped === t.maxWorkoutIntensity) return t;
      return {
        ...t,
        maxWorkoutIntensity: capped,
        reasons: [...t.reasons, `Вчера тяжёлая тренировка (RPE ${ctx.yesterdayMaxRpe}): сегодня не выше умеренной`],
      };
    },
  },
  {
    id: 'low-attention',
    when: (ctx) => {
      const norm = pvtNorm(ctx.recentPvtMediansMs ?? []);
      return (
        norm !== undefined &&
        ctx.todayPvtMedianMs !== undefined &&
        ctx.todayPvtMedianMs >= norm * (1 + PVT_SLOWER_SHARE)
      );
    },
    apply: (t, ctx) => {
      // Two hours earlier, but never past midnight backwards (01:00 must not become 23:00).
      const cutoff = t.caffeineCutoff < '02:00' ? '00:00' : shiftTime(t.caffeineCutoff, -120);
      const capacity = roundCapacity(t.taskCapacityMin * 0.9);
      const norm = Math.round(pvtNorm(ctx.recentPvtMediansMs ?? [])!);
      const lowered = capacity < t.taskCapacityMin;
      return {
        ...t,
        caffeineCutoff: cutoff,
        taskCapacityMin: capacity,
        reasons: [
          ...t.reasons,
          `Внимание ниже нормы: тест ${Math.round(ctx.todayPvtMedianMs!)} мс против обычных ${norm} мс — кофеин до ${cutoff}${lowered ? ', нагрузка −10%' : ''}`,
        ],
      };
    },
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
    habitsMode: 'all',
    wakeTime: b.wakeTime,
    wakeWindowMin: WAKE_WINDOW_MIN,
    deload: false,
    meditationKind: 'focus',
    mindTrainingMin: b.mindTrainingMin,
    reasons: [],
  };
}
