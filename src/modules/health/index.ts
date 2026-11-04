import type { AppModule } from '../../app/moduleTypes';
import { HealthPage } from './HealthPage';

export const healthModule: AppModule = {
  id: 'health',
  title: 'Сон',
  path: '/health/*',
  icon: '😴',
  group: 'body',
  summary: 'Журнал сна, график и цель на ночь',
  Page: HealthPage,
};
