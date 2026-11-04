import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { useTasksData } from '../data/useTasksData';
import { focusFirst } from '../logic/capacity';
import { todayList } from '../logic/lists';
import { completedOn } from '../logic/tasks';
import { AddTaskForm } from './AddTaskForm';
import { ListBody } from './ListBody';
import { PlanCard } from './PlanCard';
import { TaskRows } from './TaskRows';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';
import { useToday } from './useToday';

export function TodayView() {
  const data = useTasksData();
  const today = useToday();
  const { actions, ui } = useTaskActions();
  const targets = useDailyTargets(today);
  const focusProjectId = targets?.focusProjectId;
  const list = data && focusFirst(todayList(data.tasks, today), focusProjectId);
  const done = data ? completedOn(data.tasks, today) : [];
  return (
    <>
      <AddTaskForm defaults={{ dueDate: today }} hint="Срок — сегодня" />
      {ui}
      {list && targets && <PlanCard tasks={list} today={today} targets={targets} />}
      <TaskSection title="Сегодня">
        <ListBody
          tasks={list}
          empty="На сегодня задач нет"
          today={today}
          actions={actions}
          projectNames={data?.projectNames}
          focusProjectId={focusProjectId}
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
