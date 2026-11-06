import { useLiveQuery } from 'dexie-react-hooks';
import { toDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import type { MindSession } from '../../../core/types';

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
