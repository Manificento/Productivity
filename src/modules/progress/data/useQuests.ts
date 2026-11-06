import { useDailyTargetsRange } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey, todayKey } from '../../../core/dates';
import { questsFor, type Quest } from '../logic/quests';
import { useQuestAwards, useQuestRows } from './quests';

/** How many days back unfinished bonuses are still collected (bedtime is judged the morning after). */
export const AWARD_WINDOW_DAYS = 7;

export interface TodayQuests {
  ready: boolean;
  quests: Quest[];
  event: boolean;
}

/**
 * Quests of today from `DailyTargets`, and the bonus pass over the last week — runs whichever tab is open, so the
 * «Обзор» level does not depend on visiting «Квесты».
 */
export function useQuests(): TodayQuests {
  const today = todayKey();
  const from = shiftDateKey(today, -(AWARD_WINDOW_DAYS - 1));
  const range = useDailyTargetsRange(from, today);
  const rows = useQuestRows();
  const days =
    range && rows
      ? range.map((t) => {
          const project = rows.projects.find((p) => p.id === t.focusProjectId);
          // a deleted project: the title and the count both fall back to «any focus session»
          const targets = project ? t : { ...t, focusProjectId: undefined };
          return { date: t.date, phase: t.phase, quests: questsFor(targets, rows, { projectName: project?.name }) };
        })
      : [];
  useQuestAwards(days.flatMap((d) => d.quests.filter((q) => q.done).map((q) => ({ date: d.date, questId: q.id }))));
  const last = days[days.length - 1];
  return { ready: last !== undefined, quests: last?.quests ?? [], event: last?.phase === 'event' };
}
