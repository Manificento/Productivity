import type { AppModule } from '../../app/moduleTypes';
import { HealthPage } from './HealthPage';
import { AlarmBackground } from './components/AlarmBackground';

export const healthModule: AppModule = {
  id: 'health',
  title: 'Сон',
  path: '/health/*',
  icon: '😴',
  group: 'body',
  summary: 'Журнал сна, график и цель на ночь',
  Page: HealthPage,
  // Keeps the next wake window's alarm set and catches its switch-off (#129).
  Background: AlarmBackground,
};
