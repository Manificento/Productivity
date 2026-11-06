import { Card, Chip, Empty } from '../../../ui';
import type { TodayQuests } from '../data/useQuests';
import { QUEST_BONUS_XP } from '../logic/quests';

export function QuestsTab({ state }: { state: TodayQuests }) {
  if (!state.ready)
    return (
      <Card>
        <Empty>Загрузка…</Empty>
      </Card>
    );
  return (
    <Card title="Квесты дня">
      <ul className="flex flex-col gap-2" aria-label="Квесты дня">
        {state.quests.map((q) => (
          <li key={q.id} className="flex min-h-11 items-center justify-between gap-2" data-testid={`quest-${q.id}`}>
            <span className="flex flex-col">
              <span className={q.done ? 'text-zinc-500 line-through dark:text-zinc-400' : ''}>{q.title}</span>
              {!q.done && q.hint && <span className="text-xs text-zinc-500 dark:text-zinc-400">{q.hint}</span>}
            </span>
            <Chip tone={q.done ? 'success' : 'neutral'}>{q.done ? 'Готово' : `+${QUEST_BONUS_XP} XP`}</Chip>
          </li>
        ))}
      </ul>
      {state.event && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          День события: только ключевые привычки и дыхание, без тренировок.
        </p>
      )}
    </Card>
  );
}
