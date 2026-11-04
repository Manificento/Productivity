import type { AppModule } from '../../app/moduleTypes';
import { TrainingPage } from './TrainingPage';

/**
 * «Тренировки» (SPEC 0.3). A skeleton for the `training` lane: not pinned, reached through «Блоки» and
 * marked «скоро» there; the route works and shows «скоро» until the block has content.
 */
export const trainingModule: AppModule = {
  id: 'training',
  title: 'Тренировки',
  path: '/training/*',
  icon: '🏋️',
  group: 'body',
  summary: 'Программы тренировок и план недели',
  comingSoon: true,
  Page: TrainingPage,
};
