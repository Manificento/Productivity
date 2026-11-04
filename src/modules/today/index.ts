import type { AppModule } from '../../app/moduleTypes';
import { TodayPage } from './TodayPage';

export const todayModule: AppModule = {
  id: 'today',
  title: 'Сегодня',
  path: '/',
  icon: '🏠',
  navOrder: 1,
  Page: TodayPage,
};
