import type { AppModule } from '../../app/moduleTypes';
import { MeditationPage } from './MeditationPage';

/**
 * «Медитация» (SPEC 0.3). A skeleton for the `meditation` lane: no `navOrder` yet, so the block is hidden from
 * the bottom navigation until it has something to show; the route works and shows «скоро».
 */
export const meditationModule: AppModule = {
  id: 'meditation',
  title: 'Медитация',
  path: '/meditation/*',
  icon: '🧘',
  Page: MeditationPage,
};
