import type { AppModule } from '../../app/moduleTypes';
import { TasksPage } from './TasksPage';

export const tasksModule: AppModule = {
  id: 'tasks',
  title: 'Задачи',
  path: '/tasks/*',
  icon: '✅',
  navOrder: 2,
  Page: TasksPage,
};
