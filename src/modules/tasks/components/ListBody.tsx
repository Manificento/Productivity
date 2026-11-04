import type { ComponentProps } from 'react';
import { Empty } from '../../../ui';
import { TaskRows } from './TaskRows';

/** Loading / empty / rows for one task list. `tasks` is undefined while loading. */
export function ListBody({
  tasks,
  empty,
  ...rows
}: Omit<ComponentProps<typeof TaskRows>, 'tasks'> & {
  tasks: ComponentProps<typeof TaskRows>['tasks'] | undefined;
  empty: string;
}) {
  if (tasks === undefined) return <Empty>Загрузка…</Empty>;
  if (tasks.length === 0) return <Empty>{empty}</Empty>;
  return <TaskRows tasks={tasks} {...rows} />;
}
