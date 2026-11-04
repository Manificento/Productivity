import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, IconButton, Sheet } from '../../../ui';
import { renameProject, setProjectArchived } from '../data/projects';
import { useTasksData } from '../data/useTasksData';
import { projectList } from '../logic/lists';
import { AddTaskForm } from './AddTaskForm';
import { ListBody } from './ListBody';
import { ProjectNameForm } from './ProjectNameForm';
import { TaskSection } from './TaskSection';
import { useTaskActions } from './useTaskActions';
import { useToday } from './useToday';

export function ProjectView() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const data = useTasksData();
  const today = useToday();
  const { actions, ui } = useTaskActions();
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string>();

  if (!data) return <Empty>Загрузка…</Empty>;
  const project = data.projects.find((p) => p.id === projectId);
  if (!project || project.archived) {
    return (
      <Empty>
        {project ? 'Проект в архиве — вернуть его можно во вкладке «Проекты».' : 'Проект не найден.'}{' '}
        <Link to="/tasks/projects" className="text-indigo-600 underline dark:text-indigo-400">
          Все проекты
        </Link>
      </Empty>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 break-words text-xl font-semibold">#{project.name}</h2>
        <IconButton label="Переименовать проект" onClick={() => setRenaming(true)}>
          ✏️
        </IconButton>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await setProjectArchived(project.id, true);
              navigate('/tasks/projects');
            } catch {
              setError('Не удалось сохранить изменения — попробуйте ещё раз');
            }
          }}
        >
          В архив
        </Button>
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-rose-600">
          {error}
        </p>
      )}
      <AddTaskForm defaults={{ projectId: project.id }} hint={`Попадёт в проект «${project.name}»`} />
      {ui}
      <TaskSection title="Задачи проекта">
        <ListBody
          tasks={projectList(data.tasks, project.id, today)}
          empty="В проекте пока нет задач"
          today={today}
          actions={actions}
        />
      </TaskSection>
      <Sheet open={renaming} title="Переименовать проект" onClose={() => setRenaming(false)}>
        <ProjectNameForm
          label="Название проекта"
          submitLabel="Сохранить"
          initial={project.name}
          onCancel={() => setRenaming(false)}
          onSubmit={async (name) => {
            await renameProject(project.id, name);
            setRenaming(false);
          }}
        />
      </Sheet>
    </>
  );
}
