import type { AppModule } from '../../app/moduleTypes';
import { ProgressPage } from './ProgressPage';

/**
 * «Прогресс» (SPEC 0.3). A skeleton for the `progress` lane: no `navOrder` yet, so the block is hidden from
 * the bottom navigation until it has something to show; the route works and shows «скоро».
 */
export const progressModule: AppModule = {
  id: 'progress',
  title: 'Прогресс',
  path: '/progress/*',
  icon: '🏆',
  Page: ProgressPage,
};
