import type { Id, Project, Task } from '../../../core/types';
import { useProjects } from './projects';
import { useAllTasks } from './tasks';

/** Tasks and projects for list screens; `undefined` while either is loading. */
export function useTasksData(): { tasks: Task[]; projects: Project[]; projectNames: Map<Id, string> } | undefined {
  const tasks = useAllTasks();
  const projects = useProjects();
  if (!tasks || !projects) return undefined;
  return { tasks, projects, projectNames: new Map(projects.map((p) => [p.id, p.name])) };
}
