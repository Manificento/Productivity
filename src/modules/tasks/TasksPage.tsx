import { useState } from 'react';
import { todayKey } from '../../core/dates';
import type { Task } from '../../core/types';
import { Empty, Page } from '../../ui';
import { AddTaskForm } from './components/AddTaskForm';
import { DeleteTaskSheet } from './components/DeleteTaskSheet';
import { TaskItem } from './components/TaskItem';
import { TaskSection } from './components/TaskSection';
import { deleteTask, toggleTask, useAllTasks } from './data/tasks';
import { activeTasks, completedOn } from './logic/tasks';

export function TasksPage() {
  const tasks = useAllTasks();
  const [toDelete, setToDelete] = useState<Task>();
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<void>) {
    try {
      await action();
      setError(undefined);
    } catch {
      setError('Не удалось сохранить изменения — попробуйте ещё раз');
    }
  }

  const onToggle = (task: Task) => run(() => toggleTask(task.id));
  const onConfirmDelete = (task: Task) => {
    setToDelete(undefined);
    void run(() => deleteTask(task.id));
  };

  const active = tasks ? activeTasks(tasks) : [];
  const doneToday = tasks ? completedOn(tasks, todayKey()) : [];

  return (
    <Page title="Задачи">
      <AddTaskForm />
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      <TaskSection title="Входящие">
        {tasks === undefined ? (
          <Empty>Загрузка…</Empty>
        ) : active.length === 0 ? (
          <Empty>Задач пока нет — добавьте первую</Empty>
        ) : (
          <ul>
            {active.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={onToggle} onDelete={setToDelete} />
            ))}
          </ul>
        )}
      </TaskSection>
      {doneToday.length > 0 && (
        <TaskSection title="Выполнено сегодня">
          <ul>
            {doneToday.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={onToggle} onDelete={setToDelete} />
            ))}
          </ul>
        </TaskSection>
      )}
      <DeleteTaskSheet task={toDelete} onConfirm={onConfirmDelete} onCancel={() => setToDelete(undefined)} />
    </Page>
  );
}
