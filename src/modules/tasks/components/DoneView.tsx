import { Empty } from '../../../ui';
import { useCompletedTasks } from '../data/tasks';
import { useMemo } from 'react';
import { useProjects } from '../data/projects';
import { dayHeading } from '../logic/format';
import { completedGroups } from '../logic/lists';
import { TaskRows } from './TaskRows';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';
import { useTodayKey } from '../../../core/dates';

/** «Выполнено»: every completed task, grouped by the day it was completed. Unchecking reopens it. */
export function DoneView() {
  const done = useCompletedTasks();
  const projects = useProjects();
  // Only project names are needed here — not the whole tasks table.
  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects]);
  const today = useTodayKey();
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
          <TaskSection key={g.date} title={dayHeading(g.date, today)}>
            <TaskRows tasks={g.tasks} today={today} actions={actions} projectNames={projectNames} />
          </TaskSection>
        ))
      )}
    </>
  );
}
