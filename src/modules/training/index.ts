import type { AppModule } from '../../app/moduleTypes';
import { TrainingPage } from './TrainingPage';

/**
 * «Тренировки» (SPEC 0.3). A skeleton for the `training` lane: no `navOrder` yet, so the block is hidden from
 * the bottom navigation until it has something to show; the route works and shows «скоро».
 */
export const trainingModule: AppModule = {
  id: 'training',
  title: 'Тренировки',
  path: '/training/*',
  icon: '🏋️',
  Page: TrainingPage,
};
