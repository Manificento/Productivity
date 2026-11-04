import { Link } from 'react-router-dom';
import { Button, Empty } from '../../../ui';
import { addProject, setProjectArchived } from '../data/projects';
import { useTasksData } from '../data/useTasksData';
import { activeProjects } from '../logic/projects';
import { ProjectNameForm } from './ProjectNameForm';
import { TaskSection } from './TaskSection';

export function ProjectsView() {
  const data = useTasksData();
  if (!data) return <Empty>Загрузка…</Empty>;
  const active = activeProjects(data.projects);
  const archived = data.projects.filter((p) => p.archived);
  const openCount = (id: string) => data.tasks.filter((t) => t.projectId === id && t.completedAt === undefined).length;

  return (
    <>
      <ProjectNameForm
        label="Новый проект"
        submitLabel="Создать проект"
        onSubmit={async (name) => {
          await addProject(name);
        }}
      />
      <TaskSection title="Проекты">
        {active.length === 0 ? (
          <Empty>Проектов пока нет — создайте первый</Empty>
        ) : (
          <ul>
            {active.map((p) => (
              <li key={p.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
                <Link
                  to={`/tasks/projects/${p.id}`}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <span className="min-w-0 break-words">#{p.name}</span>
                  <span className="text-sm text-zinc-500" aria-label={`Открытых задач: ${openCount(p.id)}`}>
                    {openCount(p.id)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </TaskSection>
      {archived.length > 0 && (
        <TaskSection title="Архив проектов">
          <ul>
            {archived.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 px-2">
                <span className="min-w-0 break-words text-zinc-500">#{p.name}</span>
                <Button variant="secondary" onClick={() => void setProjectArchived(p.id, false)}>
                  Вернуть
                </Button>
              </li>
            ))}
          </ul>
        </TaskSection>
      )}
    </>
  );
}
