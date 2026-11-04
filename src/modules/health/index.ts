import type { AppModule } from '../../app/moduleTypes';
import { HealthPage } from './HealthPage';

export const healthModule: AppModule = {
  id: 'health',
  title: 'Здоровье',
  path: '/health/*',
  icon: '💪',
  navOrder: 5,
  Page: HealthPage,
};
