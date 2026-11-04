import { useDailyTargets } from '../../../core/adaptation/useDailyTargets';
import { shiftDateKey, todayKey } from '../../../core/dates';
import { Empty } from '../../../ui';
import { useTasksData } from '../data/useTasksData';
import { dayHeading } from '../logic/format';
import { focusFirst } from '../logic/capacity';
import { upcomingGroups } from '../logic/lists';
import { AddTaskForm } from './AddTaskForm';
import { TaskRows } from './TaskRows';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';

export function UpcomingView() {
  const data = useTasksData();
  const today = todayKey();
  const { actions, ui } = useTaskActions();
  const focusProjectId = useDailyTargets(today)?.focusProjectId;
  const groups = data ? upcomingGroups(data.tasks, today) : [];
  return (
    <>
      <AddTaskForm defaults={{ dueDate: shiftDateKey(today, 1) }} hint="Срок — завтра" />
      {ui}
      {data === undefined ? (
        <Empty>Загрузка…</Empty>
      ) : groups.length === 0 ? (
        <Empty>Нет задач со сроком в будущем</Empty>
      ) : (
        groups.map((g) => (
          <TaskSection key={g.date} title={dayHeading(g.date, today)}>
            <TaskRows
              tasks={focusFirst(g.tasks, focusProjectId)}
              today={today}
              actions={actions}
              projectNames={data.projectNames}
              showDate={false}
              focusProjectId={focusProjectId}
            />
          </TaskSection>
        ))
      )}
    </>
  );
}
