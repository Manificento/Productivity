import type { AppModule } from '../../app/moduleTypes';
import { TasksPage } from './TasksPage';

export const tasksModule: AppModule = {
  id: 'tasks',
  title: 'Задачи',
  path: '/tasks/*',
  icon: '✅',
  group: 'plan',
  summary: 'Список дел, проекты и ёмкость дня',
  navOrder: 2,
  Page: TasksPage,
};
