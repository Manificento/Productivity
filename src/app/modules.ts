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
import type { AppModule, ModuleGroup } from './moduleTypes';

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

/** Group titles of the «Все блоки» screen, in display order. */
export const MODULE_GROUPS: Record<ModuleGroup, string> = {
  plan: 'План',
  body: 'Тело',
  mind: 'Ум',
  knowledge: 'Знания',
  system: 'Система',
};

/** «Сегодня» — the hub, always the first tab of the bottom bar. */
export const HOME_MODULE = MODULES.find((m) => m.path === '/*')!;

/** Up to three pinned tabs after «Сегодня» (`navOrder`); the rest is reached through «Блоки». */
export const PINNED_MODULES = MODULES.filter((m) => m !== HOME_MODULE && m.navOrder !== undefined)
  .sort((a, b) => (a.navOrder ?? 0) - (b.navOrder ?? 0))
  .slice(0, 3);
