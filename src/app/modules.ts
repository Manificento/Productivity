import { cognitionModule } from '../modules/cognition';
import { habitsModule } from '../modules/habits';
import { healthModule } from '../modules/health';
import { meditationModule } from '../modules/meditation';
import { notesModule } from '../modules/notes';
import { nutritionModule } from '../modules/nutrition';
import { progressModule } from '../modules/progress';
import { settingsModule } from '../modules/settings';
import { tasksModule } from '../modules/tasks';
import { timeModule } from '../modules/time';
import { todayModule } from '../modules/today';
import { trainingModule } from '../modules/training';
import type { AppModule } from './moduleTypes';

/**
 * Registry of all modules. Every module already has a line here,
 * so parallel sessions never need to edit this file.
 */
export const MODULES: AppModule[] = [
  todayModule,
  tasksModule,
  habitsModule,
  timeModule,
  healthModule,
  cognitionModule,
  settingsModule,
  // SPEC 0.3 skeletons (contract C3): routes work, hidden from navigation until they have content.
  nutritionModule,
  trainingModule,
  meditationModule,
  progressModule,
  notesModule,
];

export const NAV_MODULES = MODULES.filter((m) => m.navOrder !== undefined).sort(
  (a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0),
);
