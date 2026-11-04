import { Empty } from '../../../ui';
import { useCompletedTasks } from '../data/tasks';
import { useTasksData } from '../data/useTasksData';
import { dayHeading } from '../logic/format';
import { completedGroups } from '../logic/lists';
import { TaskRows } from './TaskRows';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';
import { useToday } from './useToday';

/** «Выполнено»: every completed task, grouped by the day it was completed. Unchecking reopens it. */
export function DoneView() {
  const done = useCompletedTasks();
  const data = useTasksData();
  const today = useToday();
  const { actions, ui } = useTaskActions();
  const groups = done ? completedGroups(done) : [];
  return (
    <>
      {ui}
      {done === undefined ? (
        <Empty>Загрузка…</Empty>
      ) : groups.length === 0 ? (
        <Empty>Выполненных задач пока нет</Empty>
      ) : (
        groups.map((g) => (
          <TaskSection key={g.date} title={`Выполнено: ${dayHeading(g.date, today)}`}>
            <TaskRows tasks={g.tasks} today={today} actions={actions} projectNames={data?.projectNames} />
          </TaskSection>
        ))
      )}
    </>
  );
}
