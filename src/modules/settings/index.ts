import type { AppModule } from '../../app/moduleTypes';
import { InstallPromptListener } from './components/InstallPromptListener';
import { SettingsPage } from './SettingsPage';

export const settingsModule: AppModule = {
  id: 'settings',
  title: 'Настройки',
  path: '/settings/*',
  icon: '⚙️',
  Page: SettingsPage,
  Background: InstallPromptListener,
};
