import type { Task } from '../../../core/types';
import { IconButton } from '../../../ui';

export function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const done = task.completedAt !== undefined;
  return (
    <li className="flex items-center gap-1 border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
      <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          className="size-5 accent-indigo-600"
          checked={done}
          aria-label={`Выполнено: ${task.title}`}
          onChange={() => onToggle(task)}
        />
      </label>
      <span
        className={`min-w-0 flex-1 break-words py-2 text-base ${done ? 'text-zinc-400 line-through dark:text-zinc-500' : ''}`}
      >
        {task.title}
      </span>
      <IconButton label={`Удалить «${task.title}»`} className="text-zinc-400" onClick={() => onDelete(task)}>
        🗑
      </IconButton>
    </li>
  );
}
