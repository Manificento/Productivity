import { habitsModule } from '../modules/habits';
import { healthModule } from '../modules/health';
import { settingsModule } from '../modules/settings';
import { tasksModule } from '../modules/tasks';
import { timeModule } from '../modules/time';
import { todayModule } from '../modules/today';
import type { AppModule } from './moduleTypes';

/**
 * Registry of all modules. Every module already has a line here,
 * so parallel sessions never need to edit this file.
 */
export const MODULES: AppModule[] = [todayModule, tasksModule, habitsModule, timeModule, healthModule, settingsModule];

export const NAV_MODULES = MODULES.filter((m) => m.navOrder !== undefined).sort(
  (a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0),
);
