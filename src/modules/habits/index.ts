import type { AppModule } from '../../app/moduleTypes';
import { HabitsPage } from './HabitsPage';

export const habitsModule: AppModule = {
  id: 'habits',
  title: 'Привычки',
  path: '/habits/*',
  icon: '🔁',
  navOrder: 3,
  Page: HabitsPage,
};
