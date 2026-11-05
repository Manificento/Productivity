import type { AppModule } from '../../app/moduleTypes';
import { MeditationPage } from './MeditationPage';

/**
 * «Медитация» (SPEC 0.3). Breathing timer and session log; not pinned in the bottom bar, reached through «Блоки».
 */
export const meditationModule: AppModule = {
  id: 'meditation',
  title: 'Медитация',
  path: '/meditation/*',
  icon: '🧘',
  group: 'mind',
  summary: 'Дыхание, фокус и медитации на сон',
  Page: MeditationPage,
};
