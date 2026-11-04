import type { AppModule } from '../../app/moduleTypes';
import { ProgressPage } from './ProgressPage';

/**
 * «Прогресс» (SPEC 0.3). A skeleton for the `progress` lane: not pinned, reached through «Блоки» and
 * marked «скоро» there; the route works and shows «скоро» until the block has content.
 */
export const progressModule: AppModule = {
  id: 'progress',
  title: 'Прогресс',
  path: '/progress/*',
  icon: '🏆',
  group: 'system',
  summary: 'Опыт, уровни и квесты',
  comingSoon: true,
  Page: ProgressPage,
};
