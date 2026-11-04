import { todayKey } from '../../../core/dates';
import { useTasksData } from '../data/useTasksData';
import { todayList } from '../logic/lists';
import { completedOn } from '../logic/tasks';
import { AddTaskForm } from './AddTaskForm';
import { ListBody } from './ListBody';
import { TaskRows } from './TaskRows';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';

export function TodayView() {
  const data = useTasksData();
  const today = todayKey();
  const { actions, ui } = useTaskActions();
  const done = data ? completedOn(data.tasks, today) : [];
  return (
    <>
      <AddTaskForm defaults={{ dueDate: today }} hint="Срок — сегодня" />
      {ui}
      <TaskSection title="Сегодня">
        <ListBody
          tasks={data && todayList(data.tasks, today)}
          empty="На сегодня задач нет"
          today={today}
          actions={actions}
          projectNames={data?.projectNames}
        />
      </TaskSection>
      {done.length > 0 && (
        <TaskSection title="Выполнено сегодня">
          <TaskRows tasks={done} today={today} actions={actions} projectNames={data?.projectNames} />
        </TaskSection>
      )}
    </>
  );
}
