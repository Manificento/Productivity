import { toDateKey } from './dates';
import type { ImportedSleep, ImportedWorkout, Millis } from './types';

/**
 * Pure mapping from what Health Connect / HealthKit return (through the plugin in `platform.ts`) to the core's
 * import types. No plugin import here, so it is tested without a native bridge.
 */

type StoreSleepState = 'inBed' | 'asleep' | 'awake' | 'rem' | 'deep' | 'light';

/** A sleep sample as the plugin returns it: an Android session with stages, or one HealthKit segment. */
export interface StoreSleepSample {
  startDate: string;
  endDate: string;
  platformId?: string;
  sourceId?: string;
  sourceName?: string;
  sleepState?: StoreSleepState;
  stages?: { startDate: string; endDate: string; stage: StoreSleepState }[];
}

/** A workout as the plugin returns it. */
export interface StoreWorkout {
  workoutType: string;
  /** Seconds. */
  duration: number;
  totalEnergyBurned?: number;
  totalDistance?: number;
  startDate: string;
  endDate: string;
  sourceId?: string;
  sourceName?: string;
  platformId?: string;
}

const UNKNOWN_SOURCE = 'unknown';
/** HealthKit segments of one app closer than this belong to the same night. */
const NIGHT_GAP_MS = 60 * 60_000;
const ASLEEP: ReadonlySet<StoreSleepState> = new Set(['asleep', 'light', 'deep', 'rem']);

const time = (iso: string): Millis | undefined => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
};

const minutes = (from: Millis, to: Millis) => Math.round((to - from) / 60_000);

/** A stable id when the store gives none: the same record read twice gets the same id. */
const fallbackId = (sourceId: string, from: Millis, to: Millis) => `${sourceId}:${from}:${to}`;

interface Segment {
  id?: string;
  sourceId: string;
  sourceName?: string;
  from: Millis;
  to: Millis;
  /** Asleep intervals (ms); merged and counted once per night, so overlaps and re-syncs never double. */
  asleep: [Millis, Millis][];
  /** Whether the store said anything about asleep / awake (an «in bed»-only night is «unknown», not 0). */
  statesKnown: boolean;
}

function toSegment(s: StoreSleepSample): Segment | undefined {
  const from = time(s.startDate);
  const to = time(s.endDate);
  if (from === undefined || to === undefined || to <= from) return undefined;
  const asleep: [Millis, Millis][] = [];
  let statesKnown = false;
  const stages = s.stages?.length ? s.stages : s.sleepState ? [{ ...s, stage: s.sleepState }] : [];
  for (const stage of stages) {
    if (stage.stage !== 'inBed') statesKnown = true;
    const a = time(stage.startDate);
    const b = time(stage.endDate);
    if (ASLEEP.has(stage.stage) && a !== undefined && b !== undefined && b > a) asleep.push([a, b]);
  }
  return {
    id: s.platformId,
    sourceId: s.sourceId || UNKNOWN_SOURCE,
    sourceName: s.sourceName,
    from,
    to,
    asleep,
    statesKnown,
  };
}

/** Total length of possibly overlapping intervals, minutes (rounded once). */
function unionMinutes(intervals: [Millis, Millis][]): number {
  const sorted = [...intervals].sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of sorted) {
    const start = Math.max(a, end);
    if (b > start) total += b - start;
    end = Math.max(end, b);
  }
  return Math.round(total / 60_000);
}

/**
 * Nights from sleep samples. An Android session is a night already; HealthKit gives segments («in bed», «deep»…),
 * which are merged per app while the gap is under an hour. Nights of different apps stay apart (two sources).
 * Of several sleeps of one app ending on the same day (a night and a nap), the longest is `main`. Sorted by bedtime.
 */
export function toSleepNights(samples: readonly StoreSleepSample[]): ImportedSleep[] {
  const segments = samples
    .map(toSegment)
    .filter((s): s is Segment => s !== undefined)
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.from - b.from);
  const nights: Segment[] = [];
  for (const seg of segments) {
    const last = nights.at(-1);
    if (last && last.sourceId === seg.sourceId && seg.from - last.to < NIGHT_GAP_MS) {
      last.to = Math.max(last.to, seg.to);
      last.asleep.push(...seg.asleep);
      last.statesKnown ||= seg.statesKnown;
    } else {
      nights.push({ ...seg, asleep: [...seg.asleep] });
    }
  }
  const longest = new Map<string, Segment>();
  for (const n of nights) {
    const key = `${n.sourceId}|${toDateKey(n.to)}`;
    const best = longest.get(key);
    if (!best || n.to - n.from > best.to - best.from) longest.set(key, n);
  }
  const main = new Set(longest.values());
  return nights
    .sort((a, b) => a.from - b.from)
    .map((n) => ({
      externalId: n.id || fallbackId(n.sourceId, n.from, n.to),
      sourceId: n.sourceId,
      ...(n.sourceName !== undefined && { sourceName: n.sourceName }),
      bedtime: n.from,
      wakeTime: n.to,
      ...(n.statesKnown && { asleepMin: Math.min(unionMinutes(n.asleep), minutes(n.from, n.to)) }),
      main: main.has(n),
    }));
}

const TYPE_NAMES: [RegExp, string][] = [
  [
    /strength|weightlifting|calisthenics|crossTraining|deadlift|benchPress|barbell|dumbbell|latPullDown|lunge/i,
    'Силовая',
  ],
  [/running|trackAndField/i, 'Бег'],
  [/cycling|biking|handCycling/i, 'Велосипед'],
  [/swimming/i, 'Плавание'],
  [/yoga/i, 'Йога'],
  [/walking|hiking/i, 'Ходьба'],
];

/** The app's workout type for a store workout type (the names of the training form); anything else is «Другое». */
export function workoutTypeName(storeType: string): string {
  return TYPE_NAMES.find(([re]) => re.test(storeType))?.[1] ?? 'Другое';
}

/** Workouts ready for `saveWorkout` (the module adds `rpe`); duration in whole minutes, 1…1440. */
export function toImportedWorkouts(workouts: readonly StoreWorkout[]): ImportedWorkout[] {
  const result: ImportedWorkout[] = [];
  for (const w of workouts) {
    const from = time(w.startDate);
    const to = time(w.endDate);
    if (from === undefined || to === undefined) continue;
    const sourceId = w.sourceId || UNKNOWN_SOURCE;
    const seconds = Number.isFinite(w.duration) && w.duration > 0 ? w.duration : (to - from) / 1000;
    result.push({
      externalId: w.platformId || fallbackId(sourceId, from, to),
      sourceId,
      ...(w.sourceName !== undefined && { sourceName: w.sourceName }),
      date: toDateKey(from),
      startedAt: from,
      type: workoutTypeName(w.workoutType),
      durationMin: Math.min(1440, Math.max(1, Math.round(seconds / 60))),
      ...(w.totalEnergyBurned !== undefined &&
        Number.isFinite(w.totalEnergyBurned) && { kcal: Math.round(w.totalEnergyBurned) }),
      ...(w.totalDistance !== undefined &&
        Number.isFinite(w.totalDistance) && { distanceM: Math.round(w.totalDistance) }),
    });
  }
  return result.sort((a, b) => a.startedAt - b.startedAt);
}
