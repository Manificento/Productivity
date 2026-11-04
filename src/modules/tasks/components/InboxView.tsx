import { todayKey } from '../../../core/dates';
import { useTasksData } from '../data/useTasksData';
import { inboxList } from '../logic/lists';
import { AddTaskForm } from './AddTaskForm';
import { ListBody } from './ListBody';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';

export function InboxView() {
  const data = useTasksData();
  const today = todayKey();
  const { actions, ui } = useTaskActions();
  return (
    <>
      <AddTaskForm hint="Без срока — попадёт во «Входящие»" />
      {ui}
      <TaskSection title="Входящие">
        <ListBody
          tasks={data && inboxList(data.tasks, today)}
          empty="Входящие пусты — добавьте задачу"
          today={today}
          actions={actions}
          projectNames={data?.projectNames}
        />
      </TaskSection>
    </>
  );
}
