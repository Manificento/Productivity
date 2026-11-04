import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { todayKey } from '../../../core/dates';
import { useTasksData } from '../data/useTasksData';
import { focusFirst } from '../logic/capacity';
import { inboxList } from '../logic/lists';
import { AddTaskForm } from './AddTaskForm';
import { ListBody } from './ListBody';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';

export function InboxView() {
  const data = useTasksData();
  const today = todayKey();
  const { actions, ui } = useTaskActions();
  const focusProjectId = useDailyTargets(today)?.focusProjectId;
  return (
    <>
      <AddTaskForm hint="Без срока — попадёт во «Входящие»" />
      {ui}
      <TaskSection title="Входящие">
        <ListBody
          tasks={data && focusFirst(inboxList(data.tasks, today), focusProjectId)}
          empty="Входящие пусты — добавьте задачу"
          today={today}
          actions={actions}
          projectNames={data?.projectNames}
          focusProjectId={focusProjectId}
        />
      </TaskSection>
    </>
  );
}
