import type { AppModule } from '../../app/moduleTypes';
import { TodayPage } from './TodayPage';

export const todayModule: AppModule = {
  id: 'today',
  title: 'Сегодня',
  // Root screen; the '/*' suffix only enables nested routes such as /today/events.
  path: '/*',
  icon: '🏠',
  navOrder: 1,
  Page: TodayPage,
};
