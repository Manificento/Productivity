import type { Task } from '../../../core/types';
import { Button, Sheet } from '../../../ui';

/** Asks before deleting: nothing is removed unless «Удалить» is pressed. */
export function DeleteTaskSheet({
  task,
  onConfirm,
  onCancel,
}: {
  task: Task | undefined;
  onConfirm: (task: Task) => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={task !== undefined} title="Удалить задачу?" onClose={onCancel}>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        «{task?.title}» будет удалена без возможности восстановления.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="danger" className="flex-1" onClick={() => task && onConfirm(task)}>
          Удалить
        </Button>
      </div>
    </Sheet>
  );
}
