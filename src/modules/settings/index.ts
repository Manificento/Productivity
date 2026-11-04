import type { AppModule } from '../../app/moduleTypes';
import { SettingsPage } from './SettingsPage';

export const settingsModule: AppModule = {
  id: 'settings',
  title: 'Настройки',
  path: '/settings/*',
  icon: '⚙️',
  group: 'system',
  summary: 'Резервная копия, демо-данные и установка',
  Page: SettingsPage,
};
