import { useLiveQuery } from 'dexie-react-hooks';
import { toDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import type { MindSession, MindSessionKind } from '../../../core/types';

export interface NbackRun {
  /** Epoch ms of «Начать». */
  startedAt: number;
  durationMs: number;
  level: number;
  accuracyPct: number;
  meanRtMs?: number;
  errors: number;
}

/** Saves a finished n-back session as a `mindSessions` row of kind `nback`. */
export async function saveNbackSession(run: NbackRun, now: number = Date.now()): Promise<MindSession> {
  const record: MindSession = newRecord(
    {
      date: toDateKey(run.startedAt),
      kind: 'nback' as const,
      durationMs: run.durationMs,
      accuracyPct: run.accuracyPct,
      level: run.level,
      errors: run.errors,
      ...(run.meanRtMs === undefined ? {} : { meanRtMs: run.meanRtMs }),
    },
    now,
  );
  await db.mindSessions.add(record);
  return record;
}

export function loadNbackSessions(): Promise<MindSession[]> {
  return db.mindSessions.where('kind').equals('nback').toArray();
}

export function useNbackSessions(): MindSession[] | undefined {
  return useLiveQuery(loadNbackSessions, []);
}

/** A Stroop row also keeps the interference effect (extra field; the core type has no slot for it). */
export type StroopSession = MindSession & { interferenceMs?: number };

export interface StroopRun {
  startedAt: number;
  durationMs: number;
  accuracyPct: number;
  meanRtMs?: number;
  errors: number;
  interferenceMs?: number;
}

export async function saveStroopSession(run: StroopRun, now: number = Date.now()): Promise<StroopSession> {
  const record: StroopSession = newRecord(
    {
      date: toDateKey(run.startedAt),
      kind: 'stroop' as const,
      durationMs: run.durationMs,
      accuracyPct: run.accuracyPct,
      errors: run.errors,
      ...(run.meanRtMs === undefined ? {} : { meanRtMs: run.meanRtMs }),
      ...(run.interferenceMs === undefined ? {} : { interferenceMs: run.interferenceMs }),
    },
    now,
  );
  await db.mindSessions.add(record);
  return record;
}

export interface SchulteRun {
  startedAt: number;
  /** Time to find 1–25. */
  durationMs: number;
  accuracyPct: number;
  errors: number;
}

export async function saveSchulteSession(run: SchulteRun, now: number = Date.now()): Promise<MindSession> {
  const record: MindSession = newRecord(
    {
      date: toDateKey(run.startedAt),
      kind: 'schulte' as const,
      durationMs: run.durationMs,
      accuracyPct: run.accuracyPct,
      errors: run.errors,
    },
    now,
  );
  await db.mindSessions.add(record);
  return record;
}

export function loadMindSessions(kind: MindSessionKind): Promise<MindSession[]> {
  return db.mindSessions.where('kind').equals(kind).toArray();
}

export function useMindSessions(kind: MindSessionKind): MindSession[] | undefined {
  return useLiveQuery(() => loadMindSessions(kind), [kind]);
}
