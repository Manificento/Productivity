import type { AppModule } from '../../app/moduleTypes';
import { MeditationPage } from './MeditationPage';

/**
 * «Медитация» (SPEC 0.3). A skeleton for the `meditation` lane: not pinned, reached through «Блоки» and
 * marked «скоро» there; the route works and shows «скоро» until the block has content.
 */
export const meditationModule: AppModule = {
  id: 'meditation',
  title: 'Медитация',
  path: '/meditation/*',
  icon: '🧘',
  group: 'mind',
  summary: 'Дыхание, фокус и медитации на сон',
  comingSoon: true,
  Page: MeditationPage,
};
