import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../core/db';
import type { XpSources } from '../logic/xp';

/** Read-only snapshot of every XP table; live, so undo/delete recalculates. Full scans are fine at one person's data volume — do not stack more on top. */
export function useXpSources(): XpSources | undefined {
  return useLiveQuery(async () => {
    const [
      tasks,
      habitLogs,
      timeEntries,
      sleepLogs,
      workoutLogs,
      meditationSessions,
      cognitiveTests,
      mindSessions,
      mealLogs,
      xpEvents,
    ] = await Promise.all([
      db.tasks.toArray(),
      db.habitLogs.toArray(),
      db.timeEntries.toArray(),
      db.sleepLogs.toArray(),
      db.workoutLogs.toArray(),
      db.meditationSessions.toArray(),
      db.cognitiveTests.toArray(),
      db.mindSessions.toArray(),
      db.mealLogs.toArray(),
      db.xpEvents.toArray(),
    ]);
    return {
      tasks,
      habitLogs,
      timeEntries,
      sleepLogs,
      workoutLogs,
      meditationSessions,
      cognitiveTests,
      mindSessions,
      mealLogs,
      xpEvents,
    };
  }, []);
}
