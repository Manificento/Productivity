import { useLiveQuery } from 'dexie-react-hooks';
import { shiftDateKey, toDateKey } from '../../../core/dates';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import type { CognitiveTest, DateKey } from '../../../core/types';
import { HISTORY_DAYS } from '../logic/history';
import type { PvtSummary } from '../logic/pvt';

export interface PvtRun {
  /** Epoch ms of «Начать». */
  startedAt: number;
  durationMs: number;
  result: PvtSummary;
}

/** Saves a finished PVT run. A run with no valid reaction has no median and is not saved. */
export async function savePvtResult(run: PvtRun, now: number = Date.now()): Promise<CognitiveTest> {
  if (run.result.reactionTimesMs.length === 0) throw new Error('Нет ни одной засчитанной реакции');
  const record: CognitiveTest = newRecord(
    {
      kind: 'pvt' as const,
      date: toDateKey(run.startedAt),
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      ...run.result,
    },
    now,
  );
  await db.cognitiveTests.add(record);
  return record;
}

/** PVT results of the 14 days ending `today`. */
export function loadRecentPvt(today: DateKey): Promise<CognitiveTest[]> {
  return db.cognitiveTests
    .where('[kind+date]')
    .between(['pvt', shiftDateKey(today, -(HISTORY_DAYS - 1))], ['pvt', today], true, true)
    .toArray();
}

export function useRecentPvt(today: DateKey): CognitiveTest[] | undefined {
  return useLiveQuery(() => loadRecentPvt(today), [today]);
}
