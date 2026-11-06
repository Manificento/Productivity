import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey, todayKey } from '../../../core/dates';
import { Card, Chip, Empty } from '../../../ui';
import { useQuestAwards, useQuestRows } from '../data/quests';
import { QUEST_BONUS_XP, questsFor, type Quest } from '../logic/quests';

export function QuestsTab() {
  const today = todayKey();
  const yesterday = shiftDateKey(today, -1);
  const targets = useDailyTargets(today);
  // yesterday's bedtime quest is judged by this morning's sleep log
  const yTargets = useDailyTargets(yesterday);
  const rows = useQuestRows();
  const ready = targets && yTargets && rows;

  const build = (t: typeof targets) =>
    t && rows
      ? questsFor(t, rows, {
          projectName: rows.projects.find((p) => p.id === t.focusProjectId)?.name,
        })
      : [];
  const quests: Quest[] = ready ? build(targets) : [];
  const yQuests: Quest[] = ready ? build(yTargets) : [];
  useQuestAwards([
    ...quests.filter((q) => q.done).map((q) => ({ date: today, questId: q.id })),
    ...yQuests.filter((q) => q.done).map((q) => ({ date: yesterday, questId: q.id })),
  ]);

  if (!ready)
    return (
      <Card>
        <Empty>Загрузка…</Empty>
      </Card>
    );
  return (
    <Card title="Квесты дня">
      <ul className="flex flex-col gap-2" aria-label="Квесты дня">
        {quests.map((q) => (
          <li key={q.id} className="flex min-h-11 items-center justify-between gap-2" data-testid={`quest-${q.id}`}>
            <span className={q.done ? 'text-zinc-500 line-through dark:text-zinc-400' : ''}>{q.title}</span>
            <Chip tone={q.done ? 'success' : 'neutral'}>{q.done ? 'Готово' : `+${QUEST_BONUS_XP} XP`}</Chip>
          </li>
        ))}
      </ul>
      {targets.phase === 'event' && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          День события: только ключевые привычки и дыхание, без тренировок.
        </p>
      )}
    </Card>
  );
}
