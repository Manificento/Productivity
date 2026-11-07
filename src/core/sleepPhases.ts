import type { Millis, NightSample, SleepStage } from './types';

/*
 * Sleep phases from night sensing (#250) — the rule the smart alarm uses, also natively: the Java twin is
 * `android/…/SmartWake.java` with the same constants and the same synthetic nights in its test. Change both together.
 * R&D values (owner's decision 2026-11-07: the rule is the agent's call), to revisit with real nights (#44).
 * Movement is `NightSample.movement`: the mean change of the acceleration vector in a minute, m/s² (≈0.01 lying still).
 */

/** Below this 5-minute mean the sleeper lies still (deep sleep). */
export const LIGHT_MIN_MOVEMENT = 0.05;
/** «Coming out of stillness»: the last 5 minutes move this many times more than the 15 before. */
export const RISE_FACTOR = 1.5;
/** A minute moving this much is awake (turning over, getting up). */
export const AWAKE_MOVEMENT = 0.5;
const RECENT_MIN = 5;
const BEFORE_MIN = 15;
const MINUTE = 60_000;

type ByMinute = Map<Millis, number | undefined>;
const byMinuteOf = (samples: NightSample[]): ByMinute =>
  new Map(samples.map((s) => [s.minuteStart, s.movement ?? undefined]));

/** Movement of each minute ending at `minuteStart`, newest last; `undefined` when a minute has no reading. */
function lastMinutes(byMinute: ByMinute, minuteStart: Millis, count: number): (number | undefined)[] {
  return Array.from({ length: count }, (_, i) => byMinute.get(minuteStart - (count - 1 - i) * MINUTE));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Light sleep at the minute starting `minuteStart`: the mean movement of the last 5 minutes is at least
 * `LIGHT_MIN_MOVEMENT` and `RISE_FACTOR` times the mean of the 15 minutes before — the sleeper is coming out of a
 * still stretch. All 20 minutes need readings.
 */
export function isLightSleepAt(samples: NightSample[], minuteStart: Millis): boolean {
  const minutes = lastMinutes(byMinuteOf(samples), minuteStart, RECENT_MIN + BEFORE_MIN);
  if (minutes.some((m) => m === undefined)) return false;
  const values = minutes as number[];
  const before = mean(values.slice(0, BEFORE_MIN));
  const recent = mean(values.slice(BEFORE_MIN));
  return recent >= LIGHT_MIN_MOVEMENT && recent >= before * RISE_FACTOR;
}

/**
 * Stages of a night from its minutes within `[bedtime, wakeTime)`: awake (a minute moving `AWAKE_MOVEMENT` or more),
 * light (5-minute mean at least `LIGHT_MIN_MOVEMENT` — the threshold alone: a stage lasts, while the alarm's
 * `isLightSleepAt` looks for the moment of coming out of stillness), else deep. Minutes without readings are left out; neighbours of
 * the same stage merge. REM cannot be told apart by movement alone, so it is never reported.
 */
export function sleepStages(samples: NightSample[], bedtime: Millis, wakeTime: Millis): SleepStage[] {
  const inNight = samples
    .filter((s) => s.movement !== null && s.minuteStart >= bedtime && s.minuteStart < wakeTime)
    .sort((a, b) => a.minuteStart - b.minuteStart);
  const byMinute = byMinuteOf(samples);
  const stages: SleepStage[] = [];
  for (const s of inNight) {
    const recent = lastMinutes(byMinute, s.minuteStart, RECENT_MIN).filter((m): m is number => m !== undefined);
    const stage: SleepStage['stage'] =
      s.movement! >= AWAKE_MOVEMENT ? 'awake' : mean(recent) >= LIGHT_MIN_MOVEMENT ? 'light' : 'deep';
    const start = Math.max(s.minuteStart, bedtime);
    const end = Math.min(s.minuteStart + MINUTE, wakeTime);
    const last = stages.at(-1);
    if (last && last.stage === stage && last.end === start) last.end = end;
    else stages.push({ start, end, stage });
  }
  return stages;
}
