import type { DateKey, Id, Task } from '../../../core/types';
import { TaskItem, type TaskActions } from './TaskItem';

/** A plain list of task rows. */
export function TaskRows({
  tasks,
  today,
  actions,
  projectNames,
  showDate,
  focusProjectId,
}: {
  tasks: Task[];
  today: DateKey;
  actions: TaskActions;
  projectNames?: Map<Id, string>;
  showDate?: boolean;
  /** Rows of this project get the «фокус» chip (from DailyTargets). */
  focusProjectId?: Id;
}) {
  return (
    <ul>
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          today={today}
          actions={actions}
          showDate={showDate}
          focus={focusProjectId !== undefined && t.projectId === focusProjectId}
          projectName={t.projectId ? projectNames?.get(t.projectId) : undefined}
        />
      ))}
    </ul>
  );
}
