import type { AppModule } from '../../app/moduleTypes';
import { HealthPage } from './HealthPage';
import { HealthBackground } from './components/HealthBackground';

export const healthModule: AppModule = {
  id: 'health',
  title: 'Сон',
  path: '/health/*',
  icon: '😴',
  group: 'body',
  summary: 'Журнал сна, график и цель на ночь',
  Page: HealthPage,
  // Keeps the next wake window's alarm set (#129) and imports the night from the health store (#131).
  Background: HealthBackground,
};
