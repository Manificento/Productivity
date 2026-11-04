import type { AppModule } from '../../app/moduleTypes';
import { HealthPage } from './HealthPage';

export const healthModule: AppModule = {
  id: 'health',
  title: 'Здоровье',
  path: '/health/*',
  icon: '💪',
  group: 'body',
  summary: 'Сон, питание и тренировки за день',
  Page: HealthPage,
};
