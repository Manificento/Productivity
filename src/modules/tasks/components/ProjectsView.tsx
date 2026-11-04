import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Id } from '../../../core/types';
import { Button, Empty } from '../../../ui';
import { addProject, setProjectArchived } from '../data/projects';
import { useTasksData } from '../data/useTasksData';
import { activeProjects } from '../logic/projects';
import { ProjectNameForm } from './ProjectNameForm';
import { TaskSection } from './TaskSection';

export function ProjectsView() {
  const data = useTasksData();
  const [error, setError] = useState<string>();
  if (!data) return <Empty>Загрузка…</Empty>;
  const active = activeProjects(data.projects);
  const archived = data.projects.filter((p) => p.archived);
  const openCount = (id: Id) => data.tasks.filter((t) => t.projectId === id && t.completedAt === undefined).length;

  async function restore(id: Id) {
    try {
      await setProjectArchived(id, false);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Не удалось сохранить изменения');
    }
  }

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
            {active.map((p) => {
              const count = openCount(p.id);
              return (
                <li key={p.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
                  <Link
                    to={`/tasks/projects/${p.id}`}
                    aria-label={`#${p.name}`}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span className="min-w-0 break-words">#{p.name}</span>
                    <span className="text-sm text-zinc-500" title="Открытых задач">
                      {count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </TaskSection>
      {archived.length > 0 && (
        <TaskSection title="Архив проектов">
          {error && (
            <p role="alert" className="px-2 text-sm text-rose-600">
              {error}
            </p>
          )}
          <ul>
            {archived.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 px-2">
                <span className="min-w-0 break-words text-zinc-500">#{p.name}</span>
                <Button variant="secondary" onClick={() => void restore(p.id)}>
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
