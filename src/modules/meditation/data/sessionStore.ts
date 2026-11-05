import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import { toDateKey } from '../../../core/dates';
import { newRecord } from '../../../core/ids';
import type { Millis, MeditationSession } from '../../../core/types';
import type { PatternId } from '../logic/patterns';

export function useMeditationSessions(): MeditationSession[] | undefined {
  return useLiveQuery(() => db.meditationSessions.toArray(), []);
}

export interface SessionInput {
  startedAt: Millis;
  durationMin: number;
  pattern: PatternId;
  completed: boolean;
}

/** Written once, when the session ends or is stopped. */
export async function saveSession(input: SessionInput, now: Millis = Date.now()): Promise<void> {
  await db.meditationSessions.add(
    newRecord(
      {
        date: toDateKey(input.startedAt),
        startedAt: input.startedAt,
        durationMin: input.durationMin,
        kind: 'breathing' as const,
        ...(input.pattern === 'none' ? {} : { pattern: input.pattern }),
        completed: input.completed,
      },
      now,
    ),
  );
}
