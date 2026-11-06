import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import type { XpSources } from '../logic/xp';

/** Read-only snapshot of every table that earns experience; live, so undo/delete recalculates. */
export function useXpSources(): XpSources | undefined {
  return useLiveQuery(async () => {
    const [tasks, habitLogs, timeEntries, sleepLogs, workoutLogs, meditationSessions, cognitiveTests, mindSessions] =
      await Promise.all([
        db.tasks.toArray(),
        db.habitLogs.toArray(),
        db.timeEntries.toArray(),
        db.sleepLogs.toArray(),
        db.workoutLogs.toArray(),
        db.meditationSessions.toArray(),
        db.cognitiveTests.toArray(),
        db.mindSessions.toArray(),
      ]);
    return { tasks, habitLogs, timeEntries, sleepLogs, workoutLogs, meditationSessions, cognitiveTests, mindSessions };
  }, []);
}
