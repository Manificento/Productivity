import type { DateKey, Task } from '../../../core/types';
import { Chip, IconButton } from '../../../ui';
import { dueLabel, recurrenceLabel } from '../logic/format';
import { isOverdue } from '../logic/lists';

export interface TaskActions {
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskItem({
  task,
  today,
  actions,
  projectName,
  showDate = true,
}: {
  task: Task;
  today: DateKey;
  actions: TaskActions;
  /** Shown as a chip; omit inside the project's own list. */
  projectName?: string;
  /** Show the due day; inside a day group only the time matters. */
  showDate?: boolean;
}) {
  const done = task.completedAt !== undefined;
  const overdue = isOverdue(task, today);
  const due =
    task.dueDate === undefined
      ? undefined
      : showDate && (task.dueDate !== today || task.dueTime)
        ? dueLabel(task.dueDate, today, task.dueTime)
        : task.dueTime;
  return (
    <li className="flex items-center gap-1 border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          className="size-5 accent-indigo-600"
          checked={done}
          aria-label={`Выполнено: ${task.title}`}
          onChange={() => actions.onToggle(task)}
        />
      </label>
      <div className="min-w-0 flex-1 py-2">
        <span className={`break-words text-base ${done ? 'text-zinc-400 line-through dark:text-zinc-500' : ''}`}>
          {task.title}
        </span>
        {(overdue || due || projectName || task.recurrence) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {overdue ? <Chip tone="danger">Просрочено · {due}</Chip> : due && <Chip>{due}</Chip>}
            {task.recurrence && (
              <Chip>
                <span aria-hidden="true">↻&nbsp;</span>
                {recurrenceLabel(task.recurrence)}
              </Chip>
            )}
            {projectName && <Chip tone="accent">#{projectName}</Chip>}
          </div>
        )}
      </div>
      <IconButton label={`Удалить «${task.title}»`} className="text-zinc-400" onClick={() => actions.onDelete(task)}>
        🗑
      </IconButton>
    </li>
  );
}
