import { useState } from 'react';
import type { Id, Task } from '../../../core/types';
import { deleteTask, toggleTask } from '../data/tasks';
import { DeleteTaskSheet } from './DeleteTaskSheet';
import { TaskEditor } from './TaskEditor';
import type { TaskActions } from './TaskItem';

/** Toggle, edit and confirmed delete for task rows, plus the UI they need (error line, editor, confirm sheet). */
export function useTaskActions(): { actions: TaskActions; ui: React.ReactNode } {
  const [toDelete, setToDelete] = useState<Task>();
  const [editing, setEditing] = useState<Id>();
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setError(undefined);
    } catch {
      setError('Не удалось сохранить изменения — попробуйте ещё раз');
    }
  }

  const actions: TaskActions = {
    onToggle: (task) => void run(() => toggleTask(task.id)),
    onDelete: setToDelete,
    onEdit: (task) => setEditing(task.id),
  };

  const ui = (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      <TaskEditor taskId={editing} onClose={() => setEditing(undefined)} />
      <DeleteTaskSheet
        task={toDelete}
        onCancel={() => setToDelete(undefined)}
        onConfirm={(task) => {
          setToDelete(undefined);
          void run(() => deleteTask(task.id));
        }}
      />
    </>
  );
  return { actions, ui };
}
