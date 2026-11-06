import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db } from '../../../core/db';
import { newRecord } from '../../../core/ids';
import type { DateKey, Project } from '../../../core/types';
import { QUEST_BONUS_XP, type QuestData } from '../logic/quests';

export interface QuestRows extends QuestData {
  projects: Project[];
}

/** Read-only rows the quests are judged on; live, so a finished session ticks the quest at once. */
export function useQuestRows(): QuestRows | undefined {
  return useLiveQuery(async () => {
    const [timeEntries, tasks, sleepLogs, meditationSessions, habits, habitLogs, projects] = await Promise.all([
      db.timeEntries.toArray(),
      db.tasks.toArray(),
      db.sleepLogs.toArray(),
      db.meditationSessions.toArray(),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.projects.toArray(),
    ]);
    return { timeEntries, tasks, sleepLogs, meditationSessions, habits, habitLogs, projects };
  }, []);
}

/** Writes the quest bonus once per (day, quest): a second call finds the event and does nothing. */
export async function awardQuest(date: DateKey, questId: string, now: number = Date.now()): Promise<boolean> {
  return db.transaction('rw', db.xpEvents, async () => {
    const exists = (await db.xpEvents.where('date').equals(date).toArray()).some(
      (e) => e.source === 'quest' && e.questId === questId,
    );
    if (exists) return false;
    await db.xpEvents.add(newRecord({ date, source: 'quest' as const, questId, amount: QUEST_BONUS_XP }, now));
    return true;
  });
}

/** Awards every finished quest it is given; safe to run on each render (idempotent). */
export function useQuestAwards(done: readonly { date: DateKey; questId: string }[]): void {
  const key = done.map((d) => `${d.date}:${d.questId}`).join('|');
  useEffect(() => {
    for (const d of done) void awardQuest(d.date, d.questId).catch(() => undefined);
    // `key` is the content of `done`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
